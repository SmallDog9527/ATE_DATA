import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import api from '@/api/index';
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const mode = ref('login');
const regStep = ref(1);
const loading = ref(false);
const error = ref('');
const successMsg = ref('');
const codeCooldown = ref(0);
let cooldownTimer = null;
const loginForm = ref({ username: '', password: '' });
const regForm = ref({ username: '', email: '', password: '', code: '' });
const forgotEmail = ref('');
const resetForm = ref({ password: '', confirm: '' });
const resetToken = ref('');
const passwordHint = computed(() => {
    const p = regForm.value.password;
    if (!p)
        return '';
    if (p.length < 8)
        return '❌ 至少8位';
    const hasLetter = /[a-zA-Z]/.test(p);
    const hasDigit = /\d/.test(p);
    if (!hasLetter || !hasDigit)
        return '❌ 必须包含字母和数字';
    return '✅ 密码强度良好';
});
onMounted(() => {
    // 检测是否是重置密码链接
    const token = route.query.token;
    if (token) {
        resetToken.value = token;
        mode.value = 'reset';
    }
});
function startCooldown() {
    codeCooldown.value = 60;
    if (cooldownTimer)
        clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
        codeCooldown.value--;
        if (codeCooldown.value <= 0 && cooldownTimer) {
            clearInterval(cooldownTimer);
        }
    }, 1000);
}
async function handleLogin() {
    error.value = '';
    loading.value = true;
    try {
        await authStore.login(loginForm.value.username, loginForm.value.password);
        router.push('/');
    }
    catch (e) {
        error.value = e || '登录失败';
    }
    finally {
        loading.value = false;
    }
}
async function handleSendCode() {
    error.value = '';
    if (!regForm.value.username || !regForm.value.email || !regForm.value.password) {
        error.value = '请填写所有字段';
        return;
    }
    if (regForm.value.password.length < 8) {
        error.value = '密码至少8位';
        return;
    }
    loading.value = true;
    try {
        await authStore.sendVerifyCode(regForm.value.username, regForm.value.email, regForm.value.password);
        regStep.value = 2;
        startCooldown();
    }
    catch (e) {
        error.value = e || '发送失败';
    }
    finally {
        loading.value = false;
    }
}
async function handleRegister() {
    error.value = '';
    loading.value = true;
    try {
        await authStore.register(regForm.value.username, regForm.value.email, regForm.value.password, regForm.value.code);
        successMsg.value = '注册成功！';
        setTimeout(() => {
            mode.value = 'login';
            successMsg.value = '';
            regStep.value = 1;
        }, 1500);
    }
    catch (e) {
        error.value = e || '注册失败';
    }
    finally {
        loading.value = false;
    }
}
async function handleForgot() {
    error.value = '';
    loading.value = true;
    try {
        await api.post('/auth/forgot-password', { email: forgotEmail.value });
        successMsg.value = '如果该邮箱已注册，重置链接将发送至您的邮箱，请查收。';
    }
    catch (e) {
        error.value = e || '操作失败';
    }
    finally {
        loading.value = false;
    }
}
async function handleReset() {
    error.value = '';
    if (resetForm.value.password !== resetForm.value.confirm) {
        error.value = '两次输入的密码不一致';
        return;
    }
    loading.value = true;
    try {
        await api.post('/auth/reset-password', {
            token: resetToken.value,
            new_password: resetForm.value.password,
        });
        successMsg.value = '密码已重置！3秒后跳转到登录页...';
        setTimeout(() => {
            router.replace('/login');
            mode.value = 'login';
        }, 3000);
    }
    catch (e) {
        error.value = e || '重置失败，链接可能已过期';
    }
    finally {
        loading.value = false;
    }
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sub-text']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['field']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-outline']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-outline']} */ ;
/** @type {__VLS_StyleScopedClasses['link']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
/** @type {__VLS_StyleScopedClasses['msg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-page" },
});
/** @type {__VLS_StyleScopedClasses['auth-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "auth-card" },
});
/** @type {__VLS_StyleScopedClasses['auth-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "card-header" },
});
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "form-top-title" },
});
/** @type {__VLS_StyleScopedClasses['form-top-title']} */ ;
if (__VLS_ctx.mode === 'login') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else if (__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 1) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else if (__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 2) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else if (__VLS_ctx.mode === 'forgot') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
else if (__VLS_ctx.mode === 'reset') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "logo-area" },
});
/** @type {__VLS_StyleScopedClasses['logo-area']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "logo-icon" },
});
/** @type {__VLS_StyleScopedClasses['logo-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "logo-title" },
});
/** @type {__VLS_StyleScopedClasses['logo-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "logo-subtitle" },
});
/** @type {__VLS_StyleScopedClasses['logo-subtitle']} */ ;
if (__VLS_ctx.mode === 'login') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-section" },
    });
    /** @type {__VLS_StyleScopedClasses['form-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleLogin) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.loginForm.username),
        type: "text",
        placeholder: "请输入用户名",
        required: true,
        autocomplete: "username",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "请输入密码",
        required: true,
        autocomplete: "current-password",
    });
    (__VLS_ctx.loginForm.password);
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.loading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.loading ? '登录中...' : '登 录');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "links" },
    });
    /** @type {__VLS_StyleScopedClasses['links']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.mode === 'login'))
                    throw 0;
                return (__VLS_ctx.mode = 'forgot');
                // @ts-ignore
                [mode, mode, mode, mode, mode, mode, mode, regStep, regStep, handleLogin, loginForm, loginForm, error, error, loading, loading,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.mode === 'login'))
                    throw 0;
                __VLS_ctx.mode = 'register';
                __VLS_ctx.error = '';
                // @ts-ignore
                [mode, error,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
}
else if (__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 1) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-section" },
    });
    /** @type {__VLS_StyleScopedClasses['form-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleSendCode) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.regForm.username),
        type: "text",
        placeholder: "至少3个字符",
        required: true,
        minlength: "3",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "email",
        placeholder: "用于接收验证码",
        required: true,
    });
    (__VLS_ctx.regForm.email);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "至少8位，含字母和数字",
        required: true,
    });
    (__VLS_ctx.regForm.password);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.passwordHint);
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.loading || __VLS_ctx.codeCooldown > 0),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.loading ? '发送中...' : __VLS_ctx.codeCooldown > 0 ? `重新发送 (${__VLS_ctx.codeCooldown}s)` : '发送验证码');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "links" },
    });
    /** @type {__VLS_StyleScopedClasses['links']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'login'))
                    throw 0;
                if (!(__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 1))
                    throw 0;
                __VLS_ctx.mode = 'login';
                __VLS_ctx.error = '';
                // @ts-ignore
                [mode, mode, regStep, error, error, error, loading, loading, handleSendCode, regForm, regForm, regForm, passwordHint, codeCooldown, codeCooldown, codeCooldown,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
}
else if (__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 2) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-section" },
    });
    /** @type {__VLS_StyleScopedClasses['form-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "sub-text" },
    });
    /** @type {__VLS_StyleScopedClasses['sub-text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.regForm.email);
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleRegister) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "code-row" },
    });
    /** @type {__VLS_StyleScopedClasses['code-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        value: (__VLS_ctx.regForm.code),
        type: "text",
        placeholder: "请输入6位验证码",
        maxlength: "6",
        inputmode: "numeric",
        required: true,
        ...{ class: "code-input" },
    });
    /** @type {__VLS_StyleScopedClasses['code-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleSendCode) },
        type: "button",
        ...{ class: "btn-outline" },
        disabled: (__VLS_ctx.codeCooldown > 0),
    });
    /** @type {__VLS_StyleScopedClasses['btn-outline']} */ ;
    (__VLS_ctx.codeCooldown > 0 ? `${__VLS_ctx.codeCooldown}s` : '重发');
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    if (__VLS_ctx.successMsg) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg success" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['success']} */ ;
        (__VLS_ctx.successMsg);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.loading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.loading ? '注册中...' : '完成注册');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "links" },
    });
    /** @type {__VLS_StyleScopedClasses['links']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'login'))
                    throw 0;
                if (!!(__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 1))
                    throw 0;
                if (!(__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 2))
                    throw 0;
                __VLS_ctx.regStep = 1;
                __VLS_ctx.error = '';
                // @ts-ignore
                [mode, regStep, regStep, error, error, error, loading, loading, handleSendCode, regForm, regForm, codeCooldown, codeCooldown, codeCooldown, handleRegister, successMsg, successMsg,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
}
else if (__VLS_ctx.mode === 'forgot') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-section" },
    });
    /** @type {__VLS_StyleScopedClasses['form-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleForgot) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "email",
        placeholder: "请输入您的注册邮箱",
        required: true,
    });
    (__VLS_ctx.forgotEmail);
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    if (__VLS_ctx.successMsg) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg success" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['success']} */ ;
        (__VLS_ctx.successMsg);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.loading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.loading ? '发送中...' : '发送重置链接');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "links" },
    });
    /** @type {__VLS_StyleScopedClasses['links']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'login'))
                    throw 0;
                if (!!(__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 1))
                    throw 0;
                if (!!(__VLS_ctx.mode === 'register' && __VLS_ctx.regStep === 2))
                    throw 0;
                if (!(__VLS_ctx.mode === 'forgot'))
                    throw 0;
                __VLS_ctx.mode = 'login';
                __VLS_ctx.error = '';
                __VLS_ctx.successMsg = '';
                // @ts-ignore
                [mode, mode, error, error, error, loading, loading, successMsg, successMsg, successMsg, handleForgot, forgotEmail,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
}
else if (__VLS_ctx.mode === 'reset') {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "form-section" },
    });
    /** @type {__VLS_StyleScopedClasses['form-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (__VLS_ctx.handleReset) },
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "至少8位，含字母和数字",
        required: true,
    });
    (__VLS_ctx.resetForm.password);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "password",
        placeholder: "再次输入新密码",
        required: true,
    });
    (__VLS_ctx.resetForm.confirm);
    if (__VLS_ctx.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg error" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (__VLS_ctx.error);
    }
    if (__VLS_ctx.successMsg) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "msg success" },
        });
        /** @type {__VLS_StyleScopedClasses['msg']} */ ;
        /** @type {__VLS_StyleScopedClasses['success']} */ ;
        (__VLS_ctx.successMsg);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        type: "submit",
        ...{ class: "btn-primary" },
        disabled: (__VLS_ctx.loading),
    });
    /** @type {__VLS_StyleScopedClasses['btn-primary']} */ ;
    (__VLS_ctx.loading ? '重置中...' : '确认重置');
}
// @ts-ignore
[mode, error, error, loading, loading, successMsg, successMsg, handleReset, resetForm, resetForm,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
