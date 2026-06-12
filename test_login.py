import urllib.request
import json

url = "http://localhost:8000/api/auth/login"
payload = {
    "username": "admin",
    "password": "admin123"
}

headers = {
    "Content-Type": "application/json"
}

def main():
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            print("Login response code:", response.status)
            print("Response JSON:")
            print(json.dumps(json.loads(res_body), indent=2))
    except Exception as e:
        print("Login failed with error:", e)
        if hasattr(e, 'read'):
            print("Error details:", e.read().decode('utf-8'))

if __name__ == '__main__':
    main()
