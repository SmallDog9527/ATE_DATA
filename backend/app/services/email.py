import smtplib
import random
import string
from email.message import EmailMessage
from email.policy import SMTPUTF8
from app.core.config import settings
from app.core.redis_client import get_redis

# ──────────────────────────────────────────
# 内部工具
# ──────────────────────────────────────────

def _send_smtp(to_email: str, subject: str, html_body: str, text_body: str = None):
    """Send email using static settings."""
    msg = EmailMessage(policy=SMTPUTF8)
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email

    if not text_body:
        import re
        text_body = re.sub(r'<[^>]+>', ' ', html_body)
        text_body = re.sub(r'\s+', ' ', text_body).strip()

    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype='html')

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.ehlo()
        try:
            server.starttls()
            server.ehlo()
        except Exception:
            pass
        if settings.SMTP_USER and settings.SMTP_PASS:
            server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_FROM, [to_email], msg.as_bytes())


def _send_smtp_dynamic(to_email: str, subject: str, html_body: str, text_body: str = None):
    """优先使用数据库中的动态配置，fallback到静态配置"""
    from app.core.database import SessionLocal
    from app.services.smtp_dynamic import send_smtp_auto
    db = SessionLocal()
    try:
        send_smtp_auto(db, to_email, subject, html_body, text_body)
    finally:
        db.close()


def _gen_code(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


# ──────────────────────────────────────────
# 注册验证码
# ──────────────────────────────────────────

VERIFY_CODE_TTL = 600       # 10 分钟
VERIFY_COOLDOWN_TTL = 60    # 60 秒发送冷却

def send_verify_code(email: str) -> dict:
    """
    发送注册验证码。
    返回 {"ok": True} 或 {"error": "..."}
    """
    r = get_redis()
    cooldown_key = f"verify:cooldown:{email}"
    if r.get(cooldown_key):
        return {"error": "发送太频繁，请60秒后再试"}

    code = _gen_code()
    r.setex(f"verify:email:{email}", VERIFY_CODE_TTL, code)
    r.setex(cooldown_key, VERIFY_COOLDOWN_TTL, "1")

    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1a1a2e">ATE 数据分析系统</h2>
      <p>您正在注册账号，验证码为：</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;
                  color:#1890ff;padding:16px 0">{code}</div>
      <p style="color:#888">验证码 10 分钟内有效，请勿泄露给他人。</p>
    </div>
    """
    
    text = f"""ATE 数据分析系统
您正在注册账号，验证码为：{code}
验证码 10 分钟内有效，请勿泄露给他人。"""
    
    try:
        _send_smtp_dynamic(email, "【ATE系统】注册验证码", html, text_body=text)
        return {"ok": True}
    except Exception as e:
        return {"error": f"邮件发送失败: {e}"}


def check_verify_code(email: str, code: str) -> bool:
    """校验验证码，正确则删除（一次性）"""
    r = get_redis()
    stored = r.get(f"verify:email:{email}")
    if stored and stored == code.strip():
        r.delete(f"verify:email:{email}")
        return True
    return False


# ──────────────────────────────────────────
# 密码重置链接
# ──────────────────────────────────────────

RESET_TOKEN_TTL = 1800   # 30 分钟

def send_reset_link(email: str, token: str):
    """发送密码重置链接"""
    link = f"{settings.APP_URL}/reset-password?token={token}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1a1a2e">ATE 数据分析系统</h2>
      <p>您申请了密码重置，请点击以下链接：</p>
      <a href="{link}" style="display:inline-block;margin:16px 0;padding:12px 24px;
         background:#1890ff;color:white;text-decoration:none;border-radius:4px">
        重置密码
      </a>
      <p style="color:#888">链接 30 分钟内有效，使用后立即失效。<br>
      如非本人操作，请忽略此邮件。</p>
    </div>
    """
    _send_smtp_dynamic(email, "【ATE系统】密码重置", html)


def store_reset_token(token: str, user_id: int):
    r = get_redis()
    r.setex(f"reset:token:{token}", RESET_TOKEN_TTL, str(user_id))


def verify_reset_token(token: str) -> int | None:
    """验证 token，成功返回 user_id 并删除 token（一次性）"""
    r = get_redis()
    val = r.get(f"reset:token:{token}")
    if val:
        r.delete(f"reset:token:{token}")
        return int(val)
    return None


# ──────────────────────────────────────────
# 登录失败限流
# ──────────────────────────────────────────

LOGIN_FAIL_MAX = 5
LOGIN_FAIL_TTL = 900   # 15 分钟

def record_login_fail(username: str) -> int:
    """记录登录失败，返回当前失败次数"""
    r = get_redis()
    key = f"login:fail:{username}"
    count = r.incr(key)
    if count == 1:
        r.expire(key, LOGIN_FAIL_TTL)
    return int(count)

def is_login_locked(username: str) -> bool:
    r = get_redis()
    val = r.get(f"login:fail:{username}")
    return int(val) >= LOGIN_FAIL_MAX if val else False

def clear_login_fail(username: str):
    get_redis().delete(f"login:fail:{username}")


def send_username_and_password_email(email: str, username: str, new_pass: str):
    """Send username and newly generated 12-character password via email (English comments)."""
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2 style="color:#1a1a2e">ATE 数据分析系统</h2>
      <p>已为您生成新的登录密码，您的账号登录信息如下：</p>
      <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #cbd5e1;margin:16px 0">
        <p style="margin:6px 0;font-size:15px"><strong>用户名：</strong> <span style="color:#2563eb;font-weight:bold">{username}</span></p>
        <p style="margin:6px 0;font-size:15px"><strong>新随机密码：</strong> <span style="font-family:monospace;font-size:18px;font-weight:bold;color:#dc2626">{new_pass}</span></p>
      </div>
      <p style="color:#64748b;font-size:13px">该随机密码长期有效。登录后建议您在【修改密码】中更换为便于记忆的自定义密码。</p>
    </div>
    """
    text = f"ATE 数据分析系统\n用户名: {username}\n新密码: {new_pass}\n该随机密码长期有效，请使用新密码登录系统。"
    _send_smtp_dynamic(email, "【ATE系统】账号与新随机密码通知", html, text_body=text)
