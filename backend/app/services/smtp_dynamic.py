"""
smtp_dynamic.py
从数据库动态读取 SMTP 配置发送邮件，兼容 QQ/163/Gmail/Outlook 等主流邮箱。
"""
import smtplib
import re
from email.message import EmailMessage
from email.policy import SMTPUTF8
from typing import Optional
from cryptography.fernet import Fernet
from app.core.config import settings as app_settings


# ──────────────────────────────────────────
# 加密/解密工具
# ──────────────────────────────────────────

def _get_fernet() -> Fernet:
    """从 SECRET_KEY 派生 Fernet 密钥（取前32字节 base64 编码）"""
    import base64, hashlib
    key_bytes = hashlib.sha256(app_settings.SECRET_KEY.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key_bytes)
    return Fernet(fernet_key)


def encrypt_password(plain: str) -> str:
    """加密密码，返回 base64 密文字符串"""
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    """解密密码"""
    return _get_fernet().decrypt(encrypted.encode()).decode()


# ──────────────────────────────────────────
# 获取 DB 中的 SMTP 配置
# ──────────────────────────────────────────

def get_smtp_config(db) -> Optional[dict]:
    """
    从数据库读取 SMTP 配置。
    返回 dict 含 host/port/user/password/from_addr/use_ssl，
    若未配置则返回 None。
    """
    from app.models.system_setting import SystemSetting
    cfg = db.query(SystemSetting).first()
    if not cfg or not cfg.smtp_host or not cfg.smtp_user:
        return None
    return {
        "host": cfg.smtp_host,
        "port": cfg.smtp_port or 465,
        "user": cfg.smtp_user,
        "password": decrypt_password(cfg.smtp_pass_enc) if cfg.smtp_pass_enc else "",
        "from_addr": cfg.smtp_from or cfg.smtp_user,
        "use_ssl": cfg.smtp_ssl if cfg.smtp_ssl is not None else True,
    }


# ──────────────────────────────────────────
# 发送邮件（支持 SSL 和 STARTTLS 两种方式）
# ──────────────────────────────────────────

def send_smtp_with_config(config: dict, to_email: str, subject: str,
                          html_body: str, text_body: str = None):
    print(f"[smtp_dynamic] Email sending is globally disabled. Skip sending config-based email to {to_email}")
    return
    """
    使用指定配置发送邮件。
    config 来自 get_smtp_config() 或手动构建的 dict。
    兼容：
      - QQ/163/Gmail:  SSL 端口 465  → smtplib.SMTP_SSL
      - Outlook/Office365: STARTTLS 端口 587 → smtplib.SMTP + starttls()
    """
    msg = EmailMessage(policy=SMTPUTF8)
    msg["Subject"] = subject
    msg["From"] = config["from_addr"]
    msg["To"] = to_email

    if not text_body:
        text_body = re.sub(r'<[^>]+>', ' ', html_body)
        text_body = re.sub(r'\s+', ' ', text_body).strip()

    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    host = config["host"]
    port = config["port"]
    user = config["user"]
    password = config["password"]
    use_ssl = config["use_ssl"]

    if use_ssl:
        # SSL 直连（QQ:465, 163:465, Gmail:465）
        with smtplib.SMTP_SSL(host, port, timeout=15) as server:
            server.login(user, password)
            server.sendmail(config["from_addr"], [to_email], msg.as_bytes())
    else:
        # STARTTLS（Outlook:587, 自定义）
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.sendmail(config["from_addr"], [to_email], msg.as_bytes())


# ──────────────────────────────────────────
# 发送测试邮件
# ──────────────────────────────────────────

def send_test_email(db, to_email: str) -> dict:
    """
    发送一封测试邮件到指定邮箱，确认 SMTP 配置是否正常。
    返回 {"ok": True} 或 {"error": "..."}
    """
    config = get_smtp_config(db)
    if not config:
        return {"error": "尚未配置邮箱，请先保存 SMTP 配置"}

    html = """
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1a1a2e">ATE 数据分析系统</h2>
      <p>✅ 恭喜！您的邮箱配置已成功绑定。</p>
      <p>此封邮件由系统自动发出，用于验证 SMTP 配置是否正常。</p>
      <p style="color:#888;font-size:12px">如非本人操作，请忽略此邮件。</p>
    </div>
    """
    try:
        send_smtp_with_config(config, to_email, "【ATE系统】邮箱配置测试", html)
        return {"ok": True}
    except Exception as e:
        return {"error": f"发送失败: {str(e)}"}


# ──────────────────────────────────────────
# 供 email.py 调用的统一接口（优先 DB 配置）
# ──────────────────────────────────────────

def send_smtp_auto(db, to_email: str, subject: str, html_body: str, text_body: str = None):
    """
    自动选择发送方式：
    1. 优先使用数据库中配置的 SMTP
    2. 若 DB 无配置，fallback 到 .env 的配置（原有逻辑）
    """
    config = get_smtp_config(db)
    if config:
        send_smtp_with_config(config, to_email, subject, html_body, text_body)
    else:
        # Fallback：使用原始 settings 配置
        from app.services.email import _send_smtp
        _send_smtp(to_email, subject, html_body, text_body)


def send_smtp_attachment_auto(db, to_email: str, subject: str, html_body: str,
                              attachment_bytes: bytes, attachment_name: str):
    print(f"[smtp_dynamic] Email sending with attachments is globally disabled. Skip sending to {to_email}")
    return
    """
    发送带有附件的邮件，优先使用数据库中的配置，无配置则 fallback 到 .env。
    """
    config = get_smtp_config(db)
    if not config:
        config = {
            "host": app_settings.SMTP_HOST,
            "port": app_settings.SMTP_PORT,
            "user": app_settings.SMTP_USER,
            "password": app_settings.SMTP_PASS,
            "from_addr": app_settings.SMTP_FROM,
            "use_ssl": app_settings.SMTP_PORT == 465,
        }

    msg = EmailMessage(policy=SMTPUTF8)
    msg["Subject"] = subject
    msg["From"] = config["from_addr"]
    msg["To"] = to_email

    text_body = re.sub(r'<[^>]+>', ' ', html_body)
    text_body = re.sub(r'\s+', ' ', text_body).strip()

    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    # 添加附件
    msg.add_attachment(attachment_bytes, maintype='application', subtype='octet-stream', filename=attachment_name)

    host = config["host"]
    port = config["port"]
    user = config["user"]
    password = config["password"]
    use_ssl = config["use_ssl"]

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=15) as server:
            if user and password:
                server.login(user, password)
            server.sendmail(config["from_addr"], [to_email], msg.as_bytes())
    else:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            if user and password:
                server.login(user, password)
            server.sendmail(config["from_addr"], [to_email], msg.as_bytes())

