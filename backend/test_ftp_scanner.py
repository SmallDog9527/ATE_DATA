import os
from app.services.ftp_service import _parse_ftp_line, _walk_ftp

def test_line_parser():
    print("[*] Testing _parse_ftp_line compatibility parser...")
    
    # 1. Unix Format Tests
    unix_file = "-rw-r--r--   1 root     root         1024 May 28 05:59 test_data.csv"
    res1 = _parse_ftp_line(unix_file)
    assert res1 == ("test_data.csv", False), f"Failed Unix file: {res1}"
    
    unix_dir = "drwxr-xr-x   2 root     root         4096 May 28 05:59 lot_folder"
    res2 = _parse_ftp_line(unix_dir)
    assert res2 == ("lot_folder", True), f"Failed Unix directory: {res2}"
    
    unix_link = "lrwxrwxrwx   1 root     root           11 May 28 05:59 link_to_folder -> target"
    res3 = _parse_ftp_line(unix_link)
    # UNIX standard link name might contain target, let's make sure it handles parts[8:] properly
    assert res3[1] == False, f"Failed Unix link: {res3}" # Links are treated as files or resolved separately, but NOT as directories (unless symlink is traversed directly, standard behavior is fine)
    
    # 2. Windows/IIS Format Tests
    win_dir = "02-11-26  03:04PM       <DIR>          LotFiles"
    res4 = _parse_ftp_line(win_dir)
    assert res4 == ("LotFiles", True), f"Failed Windows directory: {res4}"
    
    win_file = "02-11-26  03:04PM             12345678 my_lot.zip"
    res5 = _parse_ftp_line(win_file)
    assert res5 == ("my_lot.zip", False), f"Failed Windows file: {res5}"
    
    # 3. Invalid lines
    assert _parse_ftp_line("") is None
    assert _parse_ftp_line("invalid line listing") is None
    
    print("[OK] _parse_ftp_line compatibility parser verified successfully!")

class MockFTP:
    def __init__(self, tree):
        self.tree = tree

    def retrlines(self, cmd, callback):
        # cmd looks like: "LIST dir"
        parts = cmd.split()
        path = parts[1] if len(parts) > 1 else "."
        # Normalize path
        path = path.replace('\\', '/')
        if path == '.':
            path = 'root'
            
        items = self.tree.get(path, [])
        for item in items:
            callback(item)

def test_recursive_walk():
    print("\n[*] Testing _walk_ftp recursive directory traversal...")
    
    # Mock directory tree:
    # root/
    #   - sub1/ (directory)
    #   - sub2/ (directory)
    #   - file1.csv (file)
    #   - file2.txt (file, should be ignored)
    # root/sub1/
    #   - sub1_1/ (directory)
    #   - data1.zip (file)
    # root/sub1/sub1_1/
    #   - data2.csv (file)
    # root/sub2/
    #   - loop_link/ (circular symlink directory pointing back to root/sub1)
    #   - data3.csv (file)
    
    tree = {
        "root": [
            "drwxr-xr-x   2 root     root         4096 May 28 05:59 sub1",
            "drwxr-xr-x   2 root     root         4096 May 28 05:59 sub2",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 file1.csv",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 file2.txt",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 file_sum.csv",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 file_SUM.CSV",
        ],
        "root/sub1": [
            "drwxr-xr-x   2 root     root         4096 May 28 05:59 sub1_1",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 data1.zip",
        ],
        "root/sub1/sub1_1": [
            "-rw-r--r--   1 root     root         1024 May 28 05:59 data2.csv",
        ],
        "root/sub2": [
            "drwxr-xr-x   2 root     root         4096 May 28 05:59 loop_link",
            "-rw-r--r--   1 root     root         1024 May 28 05:59 data3.csv",
        ],
        "root/sub2/loop_link": [
            "drwxr-xr-x   2 root     root         4096 May 28 05:59 sub1_1", # links back to sub1
        ]
    }
    
    # We will trigger cyclic visits to root/sub1 from root/sub2/loop_link
    # By making root/sub2/loop_link list exactly same as root/sub1
    tree["root/sub2/loop_link"] = tree["root/sub1"]
    
    ftp = MockFTP(tree)
    result = []
    visited = set()
    
    _walk_ftp(ftp, "root", result, visited)
    
    print(f"[*] Found files: {result}")
    print(f"[*] Visited directories: {visited}")
    
    # Expected results:
    # - root/file1.csv
    # - root/sub1/data1.zip
    # - root/sub1/sub1_1/data2.csv
    # - root/sub2/data3.csv
    # - root/sub2/loop_link/sub1_1/data2.csv (since root/sub2/loop_link lists root/sub1, but we standardized path check)
    
    # Let's verify files found:
    assert "root/file1.csv" in result
    assert "root/sub1/data1.zip" in result
    assert "root/sub1/sub1_1/data2.csv" in result
    assert "root/sub2/data3.csv" in result
    assert "root/file_sum.csv" not in result, "Failed to exclude file_sum.csv"
    assert "root/file_SUM.CSV" not in result, "Failed to exclude file_SUM.CSV"
    
    print("[OK] _walk_ftp recursive walk verified successfully!")

import io
class MockSFTPAttribute:
    def __init__(self, filename, mode, size):
        self.filename = filename
        self.st_mode = mode
        self.st_size = size

class MockSFTPClient:
    def __init__(self, tree_attrs):
        self.tree_attrs = tree_attrs

    def listdir_attr(self, path):
        return self.tree_attrs.get(path, [])

    def stat(self, path):
        import posixpath
        parent, filename = posixpath.split(path)
        for attr in self.tree_attrs.get(parent, []):
            if attr.filename == filename:
                return attr
        raise IOError("No such file")

    def open(self, path, mode):
        return io.BytesIO(b"file content data")

def test_sftp_adapter():
    print("\n[*] Testing SftpAdapter behavior and compatibility...")
    import stat
    from app.services.ftp_service import SftpAdapter
    
    DIR_MODE = stat.S_IFDIR | 0o755
    FILE_MODE = stat.S_IFREG | 0o644
    
    tree_attrs = {
        "root": [
            MockSFTPAttribute("sub1", DIR_MODE, 4096),
            MockSFTPAttribute("file1.csv", FILE_MODE, 1024),
        ],
        "root/sub1": [
            MockSFTPAttribute("data1.zip", FILE_MODE, 2048),
        ]
    }
    
    mock_sftp = MockSFTPClient(tree_attrs)
    adapter = SftpAdapter(None, mock_sftp)
    
    # 1. Test size
    assert adapter.size("root/file1.csv") == 1024
    assert adapter.size("non_existent") == 0
    
    # 2. Test retrbinary
    chunks = []
    adapter.retrbinary("RETR root/file1.csv", chunks.append)
    assert b"".join(chunks) == b"file content data"
    
    # 3. Test retrlines (LIST)
    lines = []
    adapter.retrlines("LIST root", lines.append)
    assert len(lines) == 2
    assert any("sub1" in l and l.startswith("d") for l in lines)
    assert any("file1.csv" in l and l.startswith("-") for l in lines)
    
    print("[OK] SftpAdapter verified successfully!")

if __name__ == "__main__":
    print("[*] Starting FTP Scanner module verification...")
    test_line_parser()
    test_recursive_walk()
    test_sftp_adapter()
    print("[*] Module verification PASSED!")
