import { ref, computed } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const collapsed = ref(false);
const aiOpen = ref(false);
const pageTitles = {
    '/': '数据列表',
    '/analysis': '量产良率',
    '/reports': '报表中心',
    '/settings': '系统设置',
};
const isAnalysisActive = computed(() => {
    return route.path === '/analysis' ||
        route.path.startsWith('/lot') ||
        route.path.startsWith('/multi-analysis') ||
        route.path.startsWith('/multi-param') ||
        route.path.startsWith('/multi-bin');
});
const pageTitle = computed(() => pageTitles[route.path] || '');
function handleLogout() {
    authStore.logout();
    router.push('/login');
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['username-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "layout" },
});
/** @type {__VLS_StyleScopedClasses['layout']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: (['sidebar', { collapsed: __VLS_ctx.collapsed }]) },
});
/** @type {__VLS_StyleScopedClasses['collapsed']} */ ;
/** @type {__VLS_StyleScopedClasses['sidebar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "logo" },
});
/** @type {__VLS_StyleScopedClasses['logo']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "logo-icon" },
});
/** @type {__VLS_StyleScopedClasses['logo-icon']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "logo-text" },
    });
    /** @type {__VLS_StyleScopedClasses['logo-text']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "menu" },
});
/** @type {__VLS_StyleScopedClasses['menu']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "/",
    ...{ class: "menu-item" },
}));
const __VLS_2 = __VLS_1({
    to: "/",
    ...{ class: "menu-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
const { default: __VLS_5 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "icon" },
});
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
}
// @ts-ignore
[collapsed, collapsed, collapsed,];
var __VLS_3;
let __VLS_6;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    to: "/analysis",
    target: "_blank",
    ...{ class: "menu-item" },
    ...{ class: ({ 'router-link-active': __VLS_ctx.isAnalysisActive }) },
}));
const __VLS_8 = __VLS_7({
    to: "/analysis",
    target: "_blank",
    ...{ class: "menu-item" },
    ...{ class: ({ 'router-link-active': __VLS_ctx.isAnalysisActive }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['router-link-active']} */ ;
const { default: __VLS_11 } = __VLS_9.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "icon" },
});
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
}
// @ts-ignore
[collapsed, isAnalysisActive,];
var __VLS_9;
let __VLS_12;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
    to: "/reports",
    target: "_blank",
    ...{ class: "menu-item" },
}));
const __VLS_14 = __VLS_13({
    to: "/reports",
    target: "_blank",
    ...{ class: "menu-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
const { default: __VLS_17 } = __VLS_15.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "icon" },
});
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
}
// @ts-ignore
[collapsed,];
var __VLS_15;
let __VLS_18;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    to: "/program-changes",
    target: "_blank",
    ...{ class: "menu-item" },
    ...{ class: ({ 'router-link-active': __VLS_ctx.$route.path.startsWith('/program-changes') }) },
}));
const __VLS_20 = __VLS_19({
    to: "/program-changes",
    target: "_blank",
    ...{ class: "menu-item" },
    ...{ class: ({ 'router-link-active': __VLS_ctx.$route.path.startsWith('/program-changes') }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
/** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['router-link-active']} */ ;
const { default: __VLS_23 } = __VLS_21.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "icon" },
});
/** @type {__VLS_StyleScopedClasses['icon']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "label" },
    });
    /** @type {__VLS_StyleScopedClasses['label']} */ ;
}
// @ts-ignore
[collapsed, $route,];
var __VLS_21;
if (__VLS_ctx.authStore.isAdmin || __VLS_ctx.authStore.isEng) {
    let __VLS_24;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        to: "/settings",
        target: "_blank",
        ...{ class: "menu-item" },
    }));
    const __VLS_26 = __VLS_25({
        to: "/settings",
        target: "_blank",
        ...{ class: "menu-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    /** @type {__VLS_StyleScopedClasses['menu-item']} */ ;
    const { default: __VLS_29 } = __VLS_27.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "icon" },
    });
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    if (!__VLS_ctx.collapsed) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
    }
    // @ts-ignore
    [collapsed, authStore, authStore,];
    var __VLS_27;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sidebar-footer" },
});
/** @type {__VLS_StyleScopedClasses['sidebar-footer']} */ ;
if (!__VLS_ctx.collapsed) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "user-info" },
    });
    /** @type {__VLS_StyleScopedClasses['user-info']} */ ;
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        to: "/profile",
        ...{ class: "username username-link" },
    }));
    const __VLS_32 = __VLS_31({
        to: "/profile",
        ...{ class: "username username-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    /** @type {__VLS_StyleScopedClasses['username']} */ ;
    /** @type {__VLS_StyleScopedClasses['username-link']} */ ;
    const { default: __VLS_35 } = __VLS_33.slots;
    (__VLS_ctx.authStore.user?.username);
    // @ts-ignore
    [collapsed, authStore,];
    var __VLS_33;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleLogout) },
        ...{ class: "logout-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['logout-btn']} */ ;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleLogout) },
        ...{ class: "logout-btn-small" },
    });
    /** @type {__VLS_StyleScopedClasses['logout-btn-small']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "main" },
});
/** @type {__VLS_StyleScopedClasses['main']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "topbar" },
});
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.collapsed = !__VLS_ctx.collapsed);
            // @ts-ignore
            [collapsed, collapsed, handleLogout, handleLogout,];
        } },
    ...{ class: "collapse-btn" },
});
/** @type {__VLS_StyleScopedClasses['collapse-btn']} */ ;
(__VLS_ctx.collapsed ? '▶' : '◀');
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "page-title" },
});
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
(__VLS_ctx.pageTitle);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "topbar-right" },
});
/** @type {__VLS_StyleScopedClasses['topbar-right']} */ ;
let __VLS_36;
/** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
RouterLink;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
    to: "/profile",
    ...{ class: "username-tag username-tag-link" },
}));
const __VLS_38 = __VLS_37({
    to: "/profile",
    ...{ class: "username-tag username-tag-link" },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
/** @type {__VLS_StyleScopedClasses['username-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['username-tag-link']} */ ;
const { default: __VLS_41 } = __VLS_39.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.authStore.user?.username);
if (__VLS_ctx.authStore.isAdmin) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "admin-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-badge']} */ ;
}
else if (__VLS_ctx.authStore.isEng) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "admin-badge eng-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['admin-badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['eng-badge']} */ ;
}
// @ts-ignore
[collapsed, authStore, authStore, authStore, pageTitle,];
var __VLS_39;
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "content" },
});
/** @type {__VLS_StyleScopedClasses['content']} */ ;
let __VLS_42;
/** @ts-ignore @type { | typeof __VLS_components.RouterView} */
RouterView;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({}));
const __VLS_44 = __VLS_43({}, ...__VLS_functionalComponentArgsRest(__VLS_43));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: (['ai-panel', { open: __VLS_ctx.aiOpen }]) },
});
/** @type {__VLS_StyleScopedClasses['open']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.aiOpen = !__VLS_ctx.aiOpen);
            // @ts-ignore
            [aiOpen, aiOpen, aiOpen,];
        } },
    ...{ class: "ai-header" },
});
/** @type {__VLS_StyleScopedClasses['ai-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.aiOpen ? '▶' : '◀');
if (__VLS_ctx.aiOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ai-body" },
    });
    /** @type {__VLS_StyleScopedClasses['ai-body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "ai-placeholder" },
    });
    /** @type {__VLS_StyleScopedClasses['ai-placeholder']} */ ;
}
// @ts-ignore
[aiOpen, aiOpen,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
