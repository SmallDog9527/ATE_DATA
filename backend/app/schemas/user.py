from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# ──────────────────────────────────────────────
# 注册 / 登录
# ──────────────────────────────────────────────

class SendVerifyCodeRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('密码不能少于8个字符')
        if len(v.encode('utf-8')) > 72:
            raise ValueError('密码不能超过72个字符')
        has_letter = any(c.isalpha() for c in v)
        has_digit  = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError('密码必须同时包含字母和数字')
        return v


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    code: str           # 邮箱验证码

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('密码不能少于8个字符')
        if len(v.encode('utf-8')) > 72:
            raise ValueError('密码不能超过72个字符')
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('密码不能少于8个字符')
        has_letter = any(c.isalpha() for c in v)
        has_digit  = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError('密码必须同时包含字母和数字')
        return v


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('密码不能少于8个字符')
        has_letter = any(c.isalpha() for c in v)
        has_digit  = any(c.isdigit() for c in v)
        if not (has_letter and has_digit):
            raise ValueError('密码必须同时包含字母和数字')
        return v


# ──────────────────────────────────────────────
# 响应
# ──────────────────────────────────────────────

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    storage_used_bytes: Optional[int] = 0
    receive_alerts: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


# ──────────────────────────────────────────────
# Admin 用户管理
# ──────────────────────────────────────────────

class AdminResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('密码不能少于8个字符')
        return v


class UserListItem(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    email_verified: bool
    created_at: datetime
    last_login_at: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    storage_used_bytes: Optional[int] = 0
    receive_alerts: bool = False
    lot_count: int = 0

    class Config:
        from_attributes = True

# ──────────────────────────────────────────────
# Admin User Management Extensions (English comments)
# ──────────────────────────────────────────────

class AdminCreateUserRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: Optional[str] = 'user'

    @field_validator('password')
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


class AdminResetAccountPasswordRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    new_password: Optional[str] = None

    @field_validator('new_password')
    @classmethod
    def password_strength(cls, v):
        if v is not None and len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


class UserExportItem(BaseModel):
    id: int
    username: str
    email: str
    hashed_password: str
    role: str = 'user'
    is_active: bool = True
    email_verified: bool = True
    receive_alerts: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserImportItem(BaseModel):
    id: Optional[int] = None
    username: str
    email: EmailStr
    password: Optional[str] = None
    hashed_password: Optional[str] = None
    role: Optional[str] = 'user'
    is_active: Optional[bool] = True
    email_verified: Optional[bool] = True
    receive_alerts: Optional[bool] = False


class UserImportResponse(BaseModel):
    imported_count: int
    created_count: int
    updated_count: int
    errors: list[str] = []
