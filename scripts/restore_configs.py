import json
import os
from sqlalchemy import create_engine, text

db_url = os.getenv("DATABASE_URL", "postgresql://admin:3344520Qq@db:5432/chip_data")
engine = create_engine(db_url)

ftp_path = "/app/uploads/config/ftp_configs.json"
if os.path.exists(ftp_path):
    with open(ftp_path, "r", encoding="utf-8") as f:
        ftp_items = json.load(f)
    
    with engine.begin() as conn:
        for item in ftp_items:
            conn.execute(
                text("""
                    INSERT INTO osat_configs (
                        id, name, protocol, ftp_host, ftp_port, ftp_user, ftp_pass_enc,
                        ftp_encryption, ftp_remote_dir, ftp_summary_dir, schedule_start,
                        schedule_end, enabled, data_type
                    ) VALUES (
                        :id, :name, :protocol, :ftp_host, :ftp_port, :ftp_user, :ftp_pass_enc,
                        :ftp_encryption, :ftp_remote_dir, :ftp_summary_dir, :schedule_start,
                        :schedule_end, :enabled, :data_type
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        protocol = EXCLUDED.protocol,
                        ftp_host = EXCLUDED.ftp_host,
                        ftp_port = EXCLUDED.ftp_port,
                        ftp_user = EXCLUDED.ftp_user,
                        ftp_pass_enc = EXCLUDED.ftp_pass_enc,
                        ftp_encryption = EXCLUDED.ftp_encryption,
                        ftp_remote_dir = EXCLUDED.ftp_remote_dir,
                        ftp_summary_dir = EXCLUDED.ftp_summary_dir,
                        schedule_start = EXCLUDED.schedule_start,
                        schedule_end = EXCLUDED.schedule_end,
                        enabled = EXCLUDED.enabled,
                        data_type = EXCLUDED.data_type
                """),
                item
            )
        conn.execute(text("SELECT setval('osat_configs_id_seq', (SELECT MAX(id) FROM osat_configs));"))
    print("FTP configurations restored successfully.")
else:
    print("File not found: " + ftp_path)

smtp_path = "/app/uploads/config/smtp_configs.json"
if os.path.exists(smtp_path):
    with open(smtp_path, "r", encoding="utf-8") as f:
        smtp_items = json.load(f)
    
    with engine.begin() as conn:
        for item in smtp_items:
            conn.execute(
                text("""
                    INSERT INTO system_settings (
                        id, smtp_host, smtp_port, smtp_user, smtp_pass_enc,
                        smtp_from, smtp_ssl, version_update_content
                    ) VALUES (
                        :id, :smtp_host, :smtp_port, :smtp_user, :smtp_pass_enc,
                        :smtp_from, :smtp_ssl, :version_update_content
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        smtp_host = EXCLUDED.smtp_host,
                        smtp_port = EXCLUDED.smtp_port,
                        smtp_user = EXCLUDED.smtp_user,
                        smtp_pass_enc = EXCLUDED.smtp_pass_enc,
                        smtp_from = EXCLUDED.smtp_from,
                        smtp_ssl = EXCLUDED.smtp_ssl,
                        version_update_content = EXCLUDED.version_update_content
                """),
                item
            )
        conn.execute(text("SELECT setval('system_settings_id_seq', (SELECT MAX(id) FROM system_settings));"))
    print("SMTP configurations restored successfully.")
else:
    print("File not found: " + smtp_path)