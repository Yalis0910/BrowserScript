// ==UserScript==
// @name         网站快照存储与恢复助手
// @namespace    https://github.com/moyefu/BrowserScript/WebSnapshotManager
// @version      1.1.3
// @description  针对指定网站实现快照（Cookie、LocalStorage、SessionStorage）的一键存储、命名、加密备份与一键恢复
// @author       MOYEFU
// @icon         https://pic1.imgdb.cn/i/034D4F8VwYLLoU73kkQs3l.gif
// @homepage     https://scriptcat.org/zh-CN/script-show-page/7633
// @supportURL   https://scriptcat.org/zh-CN/script-show-page/7633/issue
// @license      MIT
// @match        http*://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_cookie
// @grant        GM_setClipboard
// @tag          MOYEFU
// @run-at       document-idle
// @noframes
// ==/UserScript==

/* ==UserConfig==
Config:
  show_host:
    title: 显示的主机 (多个用换行区分)
    description: 每行一条，支持通配符 * ，例：https://*.example.org*；不填写则所有网站默认不显示
    type: textarea
    default: ""
  enable_encryption:
    title: 本地数据加密
    description: 启用 AES-GCM 256 位本地数据加密存储
    type: checkbox
    default: true
  auto_reload_after_restore:
    title: 恢复后直接刷新/跳转
    description: 恢复快照成功后直接刷新或跳转至来源页面（不再弹窗确认）
    type: checkbox
    default: false
==/UserConfig== */

// 全局暴露的 UI 实例，供菜单命令与外部调度使用
let LSM_UI = null;

(async () => {
  "use strict";

  // =========================================================================
  // 0. 用户配置：show_host（每行一条，支持 * 通配符）→ 默认所有网站不显示，
  //    仅匹配到列表中的网站才运行脚本
  // =========================================================================
  function hostBlocked() {
    try {
      const raw = GM_getValue("Config.show_host", "");
      const lines = String(raw || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!lines.length) return true; // 未配置任何显示网站 → 默认全部不显示
      const candidates = [
        location.href,
        location.origin,
        location.protocol + "//" + location.host,
        location.host,
        location.hostname
      ];
      const matched = lines.some((line) => {
        const re = new RegExp(
          "^" + line.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
          "i"
        );
        return candidates.some((c) => re.test(c));
      });
      return !matched;
    } catch {
      return true;
    }
  }

  // 始终注册菜单命令（ScriptCat/Tampermonkey 菜单），按当前状态分发弹窗
  GM_registerMenuCommand("🔑 快照管理助手", () => {
    if (hostBlocked()) {
      showBlockedDialog();
    } else {
      showMainDialog();
    }
  });

  if (hostBlocked()) return;

  initApp();
})();

// 把当前站点（origin）加入 show_host 显示列表（永久开启）
function addHostToShowList() {
  try {
    const raw = GM_getValue("Config.show_host", "");
    const lines = String(raw || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const entry = location.origin;
    if (!lines.some((l) => l === entry)) {
      lines.push(entry);
      GM_setValue("Config.show_host", lines.join("\n"));
    }
  } catch (e) {
    console.error("[LSM] 写入配置失败:", e);
  }
}

// 把当前站点从 show_host 显示列表中移除（永久关闭）
function removeHostFromShowList() {
  try {
    const raw = GM_getValue("Config.show_host", "");
    const lines = String(raw || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const candidates = [
      location.href,
      location.origin,
      location.protocol + "//" + location.host,
      location.host,
      location.hostname
    ];

    const kept = lines.filter((line) => {
      const re = new RegExp(
        "^" + line.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
        "i"
      );
      return !candidates.some((c) => re.test(c));
    });

    GM_setValue("Config.show_host", kept.join("\n"));
  } catch (e) {
    console.error("[LSM] 移除配置失败:", e);
  }
}

// 本站在 show_host 之外被禁用时的处理：弹窗选择「临时显示」或「永久开启」
function ensureHostAnimationStyle() {
  if (!document.getElementById("lsm-host-animations")) {
    const style = document.createElement("style");
    style.id = "lsm-host-animations";
    style.textContent = "@keyframes lsmFadeIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}";
    (document.head || document.documentElement).appendChild(style);
  }
}

function showBlockedDialog() {
  if (document.querySelector(".lsm-dlg-mask")) return;
  ensureHostAnimationStyle();
  const mask = document.createElement("div");
  mask.className = "lsm-dlg-mask";
  mask.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);" +
    "display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  mask.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });

  const box = document.createElement("div");
  box.style.cssText =
    "width:360px;max-width:calc(100vw - 40px);background:#ffffff;border-radius:16px;" +
    "padding:24px;box-shadow:0 20px 45px -10px rgba(15,23,42,0.25),0 0 0 1px rgba(15,23,42,0.06);box-sizing:border-box;animation:lsmFadeIn .2s ease-out;";

  const title = document.createElement("div");
  title.innerHTML = "🔑 <span style='color:#0f172a;font-size:16px;font-weight:700;'>快照管理助手未激活</span>";
  title.style.cssText = "margin-bottom:10px;display:flex;align-items:center;gap:6px;";

  const desc = document.createElement("div");
  desc.textContent = "当前网站不在「显示的主机」配置白名单中。你可以选择：";
  desc.style.cssText = "font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px;";

  const tempBtn = document.createElement("button");
  tempBtn.textContent = "临时显示（仅本次生效）";
  tempBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;margin-bottom:10px;border:none;border-radius:10px;" +
    "background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;font-size:13px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(37,99,235,0.25);";

  const permBtn = document.createElement("button");
  permBtn.textContent = "永久开启（加入显示列表）";
  permBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;border:1px solid #e2e8f0;border-radius:10px;" +
    "background:#f8fafc;color:#1e293b;font-size:13px;cursor:pointer;font-weight:600;";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;margin-top:8px;border:none;background:none;" +
    "color:#94a3b8;font-size:12px;cursor:pointer;";

  const close = () => mask.remove();

  tempBtn.addEventListener("click", () => {
    close();
    initApp();
  });

  permBtn.addEventListener("click", () => {
    close();
    addHostToShowList();
    initApp();
  });

  cancelBtn.addEventListener("click", close);
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });

  box.append(title, desc, tempBtn, permBtn, cancelBtn);
  mask.appendChild(box);
  document.documentElement.appendChild(mask);
}

// 脚本正常运行时的菜单弹窗：打开管理窗 / 临时关闭 / 永久关闭
function showMainDialog() {
  if (document.querySelector(".lsm-dlg-mask")) return;
  ensureHostAnimationStyle();
  const mask = document.createElement("div");
  mask.className = "lsm-dlg-mask";
  mask.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,0.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);" +
    "display:flex;align-items:center;justify-content:center;overscroll-behavior:contain;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  mask.addEventListener("wheel", (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });

  const box = document.createElement("div");
  box.style.cssText =
    "width:360px;max-width:calc(100vw - 40px);background:#ffffff;border-radius:16px;" +
    "padding:24px;box-shadow:0 20px 45px -10px rgba(15,23,42,0.25),0 0 0 1px rgba(15,23,42,0.06);box-sizing:border-box;animation:lsmFadeIn .2s ease-out;";

  const title = document.createElement("div");
  title.innerHTML = "🔑 <span style='color:#0f172a;font-size:16px;font-weight:700;'>快照管理助手</span>";
  title.style.cssText = "margin-bottom:10px;display:flex;align-items:center;gap:6px;";

  const desc = document.createElement("div");
  desc.textContent = "当前网站已加入「显示的主机」，功能就绪。你可以选择：";
  desc.style.cssText = "font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px;";

  const openBtn = document.createElement("button");
  openBtn.textContent = "打开管理窗口";
  openBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;margin-bottom:10px;border:none;border-radius:10px;" +
    "background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;font-size:13px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(37,99,235,0.25);";

  const tmpBtn = document.createElement("button");
  tmpBtn.textContent = "临时隐藏悬浮球（刷新后恢复）";
  tmpBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:10px;" +
    "background:#f8fafc;color:#334155;font-size:13px;cursor:pointer;font-weight:500;";

  const permBtn = document.createElement("button");
  permBtn.textContent = "永久关闭（从显示列表移除）";
  permBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;border:1px solid #fecdd3;border-radius:10px;" +
    "background:#fff1f2;color:#e11d48;font-size:13px;cursor:pointer;font-weight:500;";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.style.cssText =
    "display:block;width:100%;padding:10px 0;margin-top:8px;border:none;background:none;" +
    "color:#94a3b8;font-size:12px;cursor:pointer;";

  const close = () => mask.remove();

  const hideAll = () => {
    if (LSM_UI) {
      if (LSM_UI.ball) LSM_UI.ball.style.display = "none";
      if (LSM_UI.win) {
        LSM_UI.win.style.display = "none";
        LSM_UI.win.classList.add("hidden");
      }
    }
  };

  openBtn.addEventListener("click", async () => {
    close();
    if (!LSM_UI) {
      await initApp();
    }
    if (LSM_UI && typeof LSM_UI.openWindow === "function") {
      LSM_UI.openWindow();
    }
  });

  tmpBtn.addEventListener("click", () => {
    close();
    hideAll();
  });

  permBtn.addEventListener("click", () => {
    close();
    removeHostFromShowList();
    hideAll();
  });

  cancelBtn.addEventListener("click", close);
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });

  box.append(title, desc, openBtn, tmpBtn, permBtn, cancelBtn);
  mask.appendChild(box);
  document.documentElement.appendChild(mask);
}

// =========================================================================
// 主应用逻辑初始化
// =========================================================================
async function initApp() {
  if (document.getElementById("lsm-session-manager-root")) {
    if (LSM_UI && LSM_UI.ball) {
      LSM_UI.ball.style.display = "";
      LSM_UI.ball.classList.remove("hidden");
    }
    return;
  }

  const isEncryptionEnabled = () => GM_getValue("Config.enable_encryption", true);
  const isAutoReloadEnabled = () => GM_getValue("Config.auto_reload_after_restore", false);

  // -----------------------------------------------------------------------
  // 加密与安全擦除引擎 (AES-GCM 256)
  // -----------------------------------------------------------------------
  const CryptoEngine = {
    keyCache: new Map(),

    async getDerivedKey(saltString, domain, useLegacy = false) {
      const host = domain || location.hostname;
      const salt = saltString || "SESSION_MGR_SALT_2026";
      const cacheKey = `${host}___${salt}___${useLegacy ? "legacy" : "v2"}`;

      if (this.keyCache.has(cacheKey)) {
        return this.keyCache.get(cacheKey);
      }

      const enc = new TextEncoder();
      // v2: 采用解耦 UA 的稳定派生材料，支持跨设备与跨浏览器无缝导入解密
      // legacy: 兼容旧版本保存的历史快照数据
      const baseKeyMaterial = useLegacy
        ? `LSM_KEY_${navigator.userAgent.slice(0, 32)}_${host}`
        : `LSM_KEY_V2_SNAPSHOT_${host}`;
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(baseKeyMaterial),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
      );

      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: enc.encode(salt),
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );

      this.keyCache.set(cacheKey, derivedKey);
      return derivedKey;
    },

    async encrypt(plainObject, domain) {
      if (!isEncryptionEnabled() || !crypto.subtle) {
        return { encrypted: false, payload: JSON.stringify(plainObject) };
      }
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.getDerivedKey("SESSION_SALT_GCM", domain, false);
        const encodedData = new TextEncoder().encode(JSON.stringify(plainObject));

        const cipherBuffer = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: iv },
          key,
          encodedData
        );

        const ivBase64 = btoa(String.fromCharCode(...iv));
        const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));

        return {
          encrypted: true,
          iv: ivBase64,
          payload: cipherBase64
        };
      } catch (err) {
        console.warn("[LSM] 加密失败，使用原始格式:", err);
        return { encrypted: false, payload: JSON.stringify(plainObject) };
      }
    },

    async decrypt(cipherObj, domain) {
      if (!cipherObj) return null;
      if (!cipherObj.encrypted) {
        return typeof cipherObj.payload === "string"
          ? JSON.parse(cipherObj.payload)
          : cipherObj.payload;
      }
      try {
        const iv = new Uint8Array(
          atob(cipherObj.iv)
            .split("")
            .map((c) => c.charCodeAt(0))
        );
        const cipherData = new Uint8Array(
          atob(cipherObj.payload)
            .split("")
            .map((c) => c.charCodeAt(0))
        );

        const tryDecryptWithKey = async (targetDomain, isLegacy) => {
          try {
            const key = await this.getDerivedKey("SESSION_SALT_GCM", targetDomain, isLegacy);
            const decryptedBuffer = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: iv },
              key,
              cipherData
            );
            const decryptedStr = new TextDecoder().decode(decryptedBuffer);
            return JSON.parse(decryptedStr);
          } catch (e) {
            return null;
          }
        };

        // 尝试顺序：
        // 1. 新版 v2 密钥 (指定 domain)
        // 2. 新版 v2 密钥 (当前 location.hostname)
        // 3. 旧版 legacy 密钥 (向下兼容升级前已保存快照)
        // 4. 旧版 legacy 密钥 (当前 location.hostname)
        let res = await tryDecryptWithKey(domain, false);
        if (res) return res;

        if (domain && domain !== location.hostname) {
          res = await tryDecryptWithKey(location.hostname, false);
          if (res) return res;
        }

        res = await tryDecryptWithKey(domain, true);
        if (res) return res;

        if (domain && domain !== location.hostname) {
          res = await tryDecryptWithKey(location.hostname, true);
          if (res) return res;
        }

        throw new Error("数据解密失败，可能是环境变更或跨设备密钥不匹配");
      } catch (err) {
        console.error("[LSM] 解密失败:", err);
        throw err instanceof Error ? err : new Error("数据解密失败");
      }
    },

    wipeMemory(obj) {
      if (typeof obj === "object" && obj !== null) {
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === "string") {
            obj[key] = "";
          } else if (typeof obj[key] === "object") {
            this.wipeMemory(obj[key]);
          }
          delete obj[key];
        }
      }
    }
  };

  // -----------------------------------------------------------------------
  // Cookie & WebStorage 捕获与恢复
  // -----------------------------------------------------------------------
  const SessionManager = {
    hasGmCookie() {
      return (
        typeof GM_cookie !== "undefined" &&
        GM_cookie &&
        typeof GM_cookie.list === "function" &&
        typeof GM_cookie.set === "function"
      );
    },

    async getCookies() {
      if (this.hasGmCookie()) {
        return new Promise((resolve) => {
          try {
            GM_cookie.list({ url: location.href }, (cookies, error) => {
              if (error || !cookies) {
                resolve(this.getDocumentCookies());
              } else {
                resolve(
                  cookies.map((c) => ({
                    name: c.name,
                    value: c.value,
                    domain: c.domain,
                    path: c.path || "/",
                    secure: !!c.secure,
                    httpOnly: !!c.httpOnly,
                    sameSite: c.sameSite || "unspecified",
                    expirationDate: c.expirationDate
                  }))
                );
              }
            });
          } catch (e) {
            resolve(this.getDocumentCookies());
          }
        });
      }
      return this.getDocumentCookies();
    },

    getDocumentCookies() {
      const raw = document.cookie;
      if (!raw || !raw.trim()) return [];
      return raw
        .split(";")
        .map((pair) => {
          const idx = pair.indexOf("=");
          if (idx === -1) return null;
          const name = pair.slice(0, idx).trim();
          const value = pair.slice(idx + 1).trim();
          if (!name) return null;
          return {
            name,
            value,
            domain: location.hostname,
            path: "/",
            secure: location.protocol === "https:",
            httpOnly: false
          };
        })
        .filter(Boolean);
    },

    getWebStorage() {
      const local = {};
      const session = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) local[key] = localStorage.getItem(key);
        }
      } catch (e) {}

      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) session[key] = sessionStorage.getItem(key);
        }
      } catch (e) {}

      return { localStorage: local, sessionStorage: session };
    },

    async captureCurrentSession() {
      const cookies = await this.getCookies();
      const storage = this.getWebStorage();

      const sessionObj = {
        domain: location.hostname,
        url: location.href,
        timestamp: Date.now(),
        cookies: cookies,
        localStorage: storage.localStorage,
        sessionStorage: storage.sessionStorage
      };

      const approxBytes = new Blob([JSON.stringify(sessionObj)]).size;

      return {
        ...sessionObj,
        summary: {
          cookieCount: cookies.length,
          localCount: Object.keys(storage.localStorage).length,
          sessionCount: Object.keys(storage.sessionStorage).length,
          approxBytes: approxBytes
        }
      };
    },

    async clearAllData() {
      let cookieCount = 0;
      const hostname = location.hostname;
      const hostParts = hostname.split(".");

      if (this.hasGmCookie()) {
        try {
          // 1. 获取当前页面 URL 作用域下的 Cookie
          const cookiesByUrl = await new Promise((resolve) => {
            GM_cookie.list({ url: location.href }, (c, err) => {
              if (err || !c) resolve([]);
              else resolve(c);
            });
          });

          // 2. 获取当前域名及所有可能父级域名的 Cookie（覆盖带点和不带点）
          const domainList = [hostname, "." + hostname];
          for (let i = 0; i < hostParts.length - 1; i++) {
            const d = hostParts.slice(i).join(".");
            domainList.push(d);
            domainList.push("." + d);
          }

          const domainCookies = [];
          for (const d of Array.from(new Set(domainList))) {
            try {
              const list = await new Promise((resolve) => {
                GM_cookie.list({ domain: d }, (c, err) => {
                  if (err || !c) resolve([]);
                  else resolve(c);
                });
              });
              if (Array.isArray(list)) domainCookies.push(...list);
            } catch (e) {}
          }

          // 合并去重
          const allCookiesMap = new Map();
          for (const c of [...cookiesByUrl, ...domainCookies]) {
            const key = `${c.name}___${c.domain || ""}___${c.path || ""}`;
            allCookiesMap.set(key, c);
          }

          // 并发删除所有已收集的 Cookie
          const deletePromises = Array.from(allCookiesMap.values()).map((c) => {
            return new Promise((resolve) => {
              const delDetails = {
                url: location.href,
                name: c.name
              };
              if (c.domain) delDetails.domain = c.domain;
              if (c.path) delDetails.path = c.path;

              GM_cookie.delete(delDetails, () => {
                cookieCount++;
                resolve();
              });
            });
          });
          await Promise.all(deletePromises);
        } catch (e) {}
      }

      // 无论是否使用了 GM_cookie，均通过 document.cookie 进行逐级域名和 Path 的全域兜底双向清除
      try {
        const docCookies = this.getDocumentCookies();
        for (const c of docCookies) {
          document.cookie = `${encodeURIComponent(c.name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${encodeURIComponent(c.name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${hostname}`;
          document.cookie = `${encodeURIComponent(c.name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${hostname}`;
          for (let i = 0; i < hostParts.length - 1; i++) {
            const domain = hostParts.slice(i).join(".");
            document.cookie = `${encodeURIComponent(c.name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
            document.cookie = `${encodeURIComponent(c.name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${domain}`;
          }
          cookieCount++;
        }
      } catch (e) {}

      let storageCount = 0;
      try {
        storageCount += localStorage.length;
        localStorage.clear();
      } catch (e) {}

      try {
        storageCount += sessionStorage.length;
        sessionStorage.clear();
      } catch (e) {}

      return { cookieCount, storageCount };
    },

    async restoreSession(sessionData) {
      // 切换与恢复前，先彻底清空当前所有 Cookie 与 WebStorage
      await this.clearAllData();

      let cookieSuccessCount = 0;
      let cookieFailCount = 0;

      if (Array.isArray(sessionData.cookies)) {
        if (this.hasGmCookie()) {
          const cookieSetPromises = sessionData.cookies.map((c) => {
            return new Promise((resolve) => {
              try {
                let targetDomain = c.domain || location.hostname;
                // 跨浏览器域名规范化：若当前主域名与保存域名的基准一致，统一写入当前 hostname
                if (targetDomain.startsWith(".")) {
                  const noDot = targetDomain.slice(1);
                  if (location.hostname === noDot) {
                    targetDomain = location.hostname;
                  }
                }
                const cookieDetails = {
                  url: location.href,
                  name: c.name,
                  value: c.value,
                  path: c.path || "/",
                  domain: targetDomain,
                  secure: !!c.secure,
                  httpOnly: !!c.httpOnly
                };
                if (c.sameSite && c.sameSite !== "unspecified") cookieDetails.sameSite = c.sameSite;
                if (c.expirationDate) cookieDetails.expirationDate = c.expirationDate;
                GM_cookie.set(cookieDetails, (err) => {
                  if (err) cookieFailCount++;
                  else cookieSuccessCount++;
                  resolve();
                });
              } catch (e) {
                cookieFailCount++;
                resolve();
              }
            });
          });
          await Promise.all(cookieSetPromises);
        } else {
          for (const c of sessionData.cookies) {
            try {
              let cookieStr = `${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}; path=${c.path || "/"}`;
              if (c.domain && !c.domain.startsWith(".")) cookieStr += `; domain=${c.domain}`;
              if (c.secure || location.protocol === "https:") cookieStr += "; Secure";
              if (c.expirationDate)
                cookieStr += `; expires=${new Date(c.expirationDate * 1000).toUTCString()}`;
              document.cookie = cookieStr;
              cookieSuccessCount++;
            } catch (e) {
              cookieFailCount++;
            }
          }
        }
      }

      let localCount = 0;
      if (sessionData.localStorage && typeof sessionData.localStorage === "object") {
        try {
          localStorage.clear();
          for (const [k, v] of Object.entries(sessionData.localStorage)) {
            if (v !== null && v !== undefined) {
              localStorage.setItem(k, v);
              localCount++;
            }
          }
        } catch (e) {}
      }

      let sessionCount = 0;
      if (sessionData.sessionStorage && typeof sessionData.sessionStorage === "object") {
        try {
          sessionStorage.clear();
          for (const [k, v] of Object.entries(sessionData.sessionStorage)) {
            if (v !== null && v !== undefined) {
              sessionStorage.setItem(k, v);
              sessionCount++;
            }
          }
        } catch (e) {}
      }

      return { cookieSuccessCount, cookieFailCount, localCount, sessionCount };
    }
  };

  // -----------------------------------------------------------------------
  // 数据库与存储管理
  // -----------------------------------------------------------------------
  const DB = {
    getStorageKey(domain) {
      return `SESSION_DATA_${domain || location.hostname}`;
    },

    getRecords(domain) {
      const key = this.getStorageKey(domain);
      const raw = GM_getValue(key, []);
      return Array.isArray(raw) ? raw : [];
    },

    saveRecords(records, domain) {
      const key = this.getStorageKey(domain);
      GM_setValue(key, records);
    },

    async addRecord(name, rawSessionData) {
      const domain = location.hostname;
      const records = this.getRecords(domain);
      const cipherObject = await CryptoEngine.encrypt(rawSessionData);

      const newRecord = {
        id: "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        name: name.trim(),
        domain: domain,
        url: location.href,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        summary: rawSessionData.summary,
        cipherData: cipherObject
      };

      records.unshift(newRecord);
      this.saveRecords(records, domain);
      CryptoEngine.wipeMemory(rawSessionData);
      return newRecord;
    },

    updateRecordName(id, newName, domain) {
      const d = domain || location.hostname;
      const records = this.getRecords(d);
      const target = records.find((r) => r.id === id);
      if (target) {
        target.name = newName.trim();
        target.updatedAt = Date.now();
        this.saveRecords(records, d);
        return true;
      }
      return false;
    },

    deleteRecord(id, domain) {
      const d = domain || location.hostname;
      let records = this.getRecords(d);
      const initialLen = records.length;
      records = records.filter((r) => r.id !== id);
      if (records.length !== initialLen) {
        this.saveRecords(records, d);
        return true;
      }
      return false;
    },

    importRecords(newRecords, domain) {
      const d = domain || location.hostname;
      const existing = this.getRecords(d);
      let count = 0;
      let skipped = 0;
      for (const item of newRecords) {
        if (!item || !item.name || !item.cipherData) continue;

        // 对比核心数据内容与 ID，已存在相同快照数据则直接跳过
        const itemCipherStr = typeof item.cipherData === "string" ? item.cipherData : JSON.stringify(item.cipherData);
        const isDuplicate = existing.some((r) => {
          if (!r || !r.cipherData) return false;
          const rCipherStr = typeof r.cipherData === "string" ? r.cipherData : JSON.stringify(r.cipherData);
          return rCipherStr === itemCipherStr || (r.id && item.id && r.id === item.id);
        });

        if (isDuplicate) {
          skipped++;
          continue;
        }

        // 如果 ID 冲突则重新生成，避免重复
        const record = {
          ...item,
          id: item.id && !existing.some((r) => r.id === item.id) ? item.id : "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
          importedAt: Date.now()
        };
        existing.unshift(record);
        count++;
      }
      if (count > 0) {
        this.saveRecords(existing, d);
      }
      return { count, skipped };
    },

    async getDecryptedSession(id, domain) {
      const d = domain || location.hostname;
      const records = this.getRecords(d);
      const target = records.find((r) => r.id === id);
      if (!target) throw new Error("未找到对应快照记录");
      const recDomain = target.domain || d;
      return await CryptoEngine.decrypt(target.cipherData, recDomain);
    }
  };

  // -----------------------------------------------------------------------
  // 辅助工具
  // -----------------------------------------------------------------------
  function formatTime(timestamp) {
    if (!timestamp) return "-";
    const d = new Date(timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function getDefaultName() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${location.hostname}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function downloadJsonFile(filename, contentObj) {
    try {
      const jsonStr = JSON.stringify(contentObj, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      alert("下载文件失败: " + e.message);
    }
  }

  function readFileAsJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          resolve(json);
        } catch (err) {
          reject(new Error("文件解析失败，请确认选择的是正确的 JSON 格式文件"));
        }
      };
      reader.onerror = () => reject(new Error("读取文件出错"));
      reader.readAsText(file);
    });
  }

  // -----------------------------------------------------------------------
  // UI 结构与样式
  // -----------------------------------------------------------------------
  const uid = "lsm-" + Math.random().toString(36).slice(2, 8);
  const container = document.createElement("div");
  container.id = "lsm-session-manager-root";
  const shadow = container.attachShadow({ mode: "open" });
  document.documentElement.appendChild(container);

  const style = document.createElement("style");
  style.textContent = `
    #${uid}-root {
      all: initial;
      display: block;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #0f172a;
      font-size: 13px;
      line-height: 1.5;
      text-align: left;
      -webkit-font-smoothing: antialiased;
    }
    #${uid}-root *, #${uid}-root *::before, #${uid}-root *::after {
      box-sizing: border-box;
    }
    #${uid}-root input, #${uid}-root select, #${uid}-root textarea, #${uid}-root button {
      font-family: inherit;
    }

    /* 滚动条美化 */
    .${uid}-content::-webkit-scrollbar {
      width: 6px;
    }
    .${uid}-content::-webkit-scrollbar-track {
      background: transparent;
    }
    .${uid}-content::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
    .${uid}-content::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }

    /* 悬浮球 */
    #${uid}-ball {
      position: fixed;
      left: auto;
      top: auto;
      right: 25px;
      bottom: 80px;
      z-index: 2147483646;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%);
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.2) inset;
      cursor: grab;
      user-select: none;
      opacity: 0.65;
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, opacity 0.25s ease, left 0.3s cubic-bezier(0.2, 0, 0, 1), top 0.3s cubic-bezier(0.2, 0, 0, 1);
    }
    #${uid}-ball:hover {
      opacity: 1;
      transform: scale(1.06);
      box-shadow: 0 12px 30px -4px rgba(37, 99, 235, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.3) inset;
    }
    #${uid}-ball.dragging {
      opacity: 1;
      cursor: grabbing;
      transform: scale(0.96);
      transition: none;
    }
    #${uid}-ball svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
      pointer-events: none;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }

    /* 悬浮球右上角微型关闭/菜单按钮 */
    .${uid}-ball-close {
      position: absolute;
      top: -3px;
      right: -3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      line-height: 16px;
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      text-align: center;
      cursor: pointer;
      display: none;
      z-index: 3;
      border: 1.5px solid #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      transition: background 0.15s ease, transform 0.15s ease;
    }
    #${uid}-ball:hover .${uid}-ball-close {
      display: block;
    }
    .${uid}-ball-close:hover {
      background: #e11d48;
      transform: scale(1.15);
    }

    /* 徽标 */
    .${uid}-badge {
      position: absolute;
      top: -3px;
      left: -3px;
      background: linear-gradient(135deg, #f43f5e, #e11d48);
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border: 2px solid #ffffff;
      box-shadow: 0 2px 6px rgba(225, 29, 72, 0.4);
    }

    /* 悬浮球快捷菜单遮罩与弹窗 */
    .${uid}-menu-mask {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .${uid}-menu-mask.hidden { display: none; }
    .${uid}-ball-menu {
      position: fixed;
      left: 50%;
      top: 45%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.06);
      padding: 18px;
      width: 280px;
    }
    .${uid}-ball-menu-title {
      font-weight: 700;
      margin: 0 0 12px;
      font-size: 14px;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${uid}-ball-menu button {
      display: flex;
      align-items: center;
      width: 100%;
      margin-top: 8px;
      padding: 9px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #f8fafc;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-align: left;
      color: #334155;
      transition: all 0.15s ease;
    }
    .${uid}-ball-menu button:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    .${uid}-ball-menu button[data-a="forever"] {
      border-color: #fecdd3;
      background: #fff1f2;
      color: #e11d48;
    }
    .${uid}-ball-menu button[data-a="forever"]:hover {
      background: #ffe4e6;
    }

    /* 主管理窗口 */
    #${uid}-window {
      position: fixed;
      left: auto;
      top: auto;
      right: 30px;
      bottom: 90px;
      z-index: 2147483646;
      width: 500px;
      height: 560px;
      max-width: calc(100vw - 20px);
      max-height: calc(100vh - 30px);
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.08);
      overscroll-behavior: contain;
    }
    #${uid}-window.hidden, #${uid}-ball.hidden {
      display: none !important;
    }

    /* 头部 Header */
    #${uid}-header {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 13px 18px;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #334155 100%);
      color: #f8fafc;
      font-size: 14px;
      font-weight: 600;
      cursor: grab;
      user-select: none;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    #${uid}-header.dragging {
      cursor: grabbing;
    }
    .${uid}-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .${uid}-header-title {
      display: flex;
      align-items: center;
      gap: 6px;
      letter-spacing: 0.2px;
    }
    .${uid}-domain-tag {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: #f8fafc;
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 9999px;
      font-weight: 500;
      max-width: 180px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .${uid}-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${uid}-header-actions button {
      border: none;
      background: rgba(255, 255, 255, 0.12);
      color: #f8fafc;
      border-radius: 8px;
      width: 26px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
    }
    .${uid}-header-actions button:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: scale(1.05);
    }

    /* 状态条 */
    .${uid}-status-bar {
      padding: 7px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: #64748b;
      flex: none;
    }
    .${uid}-status-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
    }
    .${uid}-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
    }
    .${uid}-dot-green {
      background: #10b981;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }
    .${uid}-dot-amber {
      background: #f59e0b;
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
    }

    /* 操作工具栏 */
    .${uid}-toolbar {
      padding: 10px 18px;
      background: #ffffff;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: none;
    }
    .${uid}-toolbar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: nowrap;
    }
    .${uid}-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .${uid}-btn-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%) !important;
      color: #ffffff !important;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
    }
    .${uid}-btn-primary:hover {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%) !important;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
      color: #ffffff !important;
    }
    .${uid}-btn-secondary {
      background: #f8fafc;
      color: #334155;
      border-color: #e2e8f0;
    }
    .${uid}-btn-secondary:hover {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #0f172a;
    }
    .${uid}-btn-danger {
      background: #fff1f2;
      color: #e11d48;
      border-color: #fecdd3;
    }
    .${uid}-btn-danger:hover {
      background: #ffe4e6;
      border-color: #fda4af;
    }
    .${uid}-btn-restore-pill {
      background: #f0fdf4 !important;
      color: #15803d !important;
      border-color: #bbf7d0 !important;
      font-weight: 600;
    }
    .${uid}-btn-restore-pill:hover {
      background: #dcfce7 !important;
      border-color: #86efac !important;
    }
    .${uid}-btn-sm {
      padding: 4px 10px;
      font-size: 11px;
      border-radius: 6px;
    }
    .${uid}-btn-icon {
      padding: 7px 9px !important;
      min-width: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    /* 更多操作下拉菜单 */
    .${uid}-dropdown-wrapper {
      position: relative;
      display: inline-flex;
      flex-shrink: 0;
    }
    .${uid}-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 175px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 12px 30px -4px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.05);
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .${uid}-dropdown-menu.hidden {
      display: none !important;
    }
    .${uid}-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 500;
      color: #334155;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      transition: all 0.12s ease;
      white-space: nowrap;
    }
    .${uid}-dropdown-item:hover {
      background: #f1f5f9;
      color: #0f172a;
    }
    .${uid}-dropdown-divider {
      height: 1px;
      background: #f1f5f9;
      margin: 4px 0;
    }
    .${uid}-item-accent {
      color: #15803d !important;
      font-weight: 600;
    }
    .${uid}-item-accent:hover {
      background: #f0fdf4 !important;
      color: #166534 !important;
    }

    /* 移动端与小屏幕自适应响应式布局 */
    @media (max-width: 480px) {
      #${uid}-window {
        left: 10px !important;
        right: 10px !important;
        bottom: 15px !important;
        width: auto !important;
        max-width: calc(100vw - 20px) !important;
        height: 82vh !important;
        border-radius: 14px;
      }
      #${uid}-header {
        padding: 10px 14px;
      }
      .${uid}-domain-tag {
        max-width: 170px;
        font-size: 10px;
        padding: 1px 6px;
      }
      .${uid}-toolbar {
        padding: 8px 12px;
        gap: 6px;
      }
      .${uid}-toolbar-row {
        gap: 6px;
      }
      .${uid}-btn {
        padding: 6px 8px;
        font-size: 11px;
        gap: 4px;
      }
      .${uid}-content {
        padding: 10px 12px;
        gap: 10px;
      }
      .${uid}-card {
        padding: 10px 12px;
      }
      .${uid}-card-chips {
        gap: 4px;
      }
      .${uid}-chip {
        font-size: 10px;
        padding: 1px 6px;
      }
      .${uid}-card-actions {
        flex-wrap: wrap;
        gap: 4px;
        justify-content: flex-end;
      }
      .${uid}-card-actions .${uid}-btn {
        padding: 4px 7px;
        font-size: 10px;
      }
      .${uid}-search-input {
        height: 30px;
        font-size: 11px;
        padding: 0 26px 0 28px;
      }
    }

    /* 搜索栏精细化美化 */
    .${uid}-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
      margin-top: 2px;
    }
    .${uid}-search-icon {
      position: absolute;
      left: 10px;
      pointer-events: none;
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s ease;
    }
    .${uid}-search-input {
      width: 100%;
      height: 32px;
      padding: 0 28px 0 32px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 12px;
      color: #1e293b;
      outline: none;
      box-sizing: border-box;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .${uid}-search-input::placeholder {
      color: #94a3b8;
      font-size: 11px;
    }
    .${uid}-search-input:focus {
      background: #ffffff;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .${uid}-search-wrap:focus-within .${uid}-search-icon {
      color: #3b82f6;
    }
    .${uid}-search-clear {
      position: absolute;
      right: 7px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: none;
      background: #e2e8f0;
      color: #64748b;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: all 0.15s ease;
    }
    .${uid}-search-clear:hover {
      background: #cbd5e1;
      color: #0f172a;
      transform: scale(1.08);
    }
    .${uid}-search-clear.hidden {
      display: none !important;
    }

    /* 记录列表区域 */
    .${uid}-content {
      padding: 14px 18px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
      background: #f8fafc;
      overscroll-behavior: contain;
    }
    .${uid}-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .${uid}-card:hover {
      border-color: #cbd5e1;
      transform: translateY(-2px);
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
    }
    .${uid}-card.${uid}-card-active {
      border-color: #86efac;
      background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 60%);
      box-shadow: 0 4px 14px -2px rgba(34, 197, 94, 0.15);
    }
    .${uid}-badge-active {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
      margin-left: 4px;
      flex-shrink: 0;
    }
    .${uid}-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .${uid}-card-name {
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
      word-break: break-all;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${uid}-card-time {
      font-size: 11px;
      color: #94a3b8;
      flex-shrink: 0;
    }
    
    /* 凭证 Chips 徽章组 */
    .${uid}-card-chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .${uid}-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 9999px;
      line-height: 1.4;
    }
    .${uid}-chip-cookie {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fef3c7;
    }
    .${uid}-chip-local {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #dcfce7;
    }
    .${uid}-chip-session {
      background: #faf5ff;
      color: #7e22ce;
      border: 1px solid #f3e8ff;
    }
    .${uid}-chip-encrypted {
      background: #f0f9ff;
      color: #0284c7;
      border: 1px solid #e0f2fe;
    }

    /* 来源链接小标签 */
    .${uid}-card-origin {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: 6px;
      padding: 4px 8px;
      margin-top: 2px;
      font-size: 11px;
      color: #64748b;
    }
    .${uid}-card-url {
      color: #2563eb;
      text-decoration: none;
      word-break: break-all;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      max-width: calc(100% - 60px);
    }
    .${uid}-card-url:hover {
      text-decoration: underline;
      color: #1d4ed8;
    }

    /* 卡片操作栏 */
    .${uid}-card-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      border-top: 1px solid #f1f5f9;
      padding-top: 8px;
      margin-top: 2px;
    }
    .${uid}-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 50px 0;
      color: #94a3b8;
      text-align: center;
      gap: 10px;
    }

    /* 内置保存抽屉弹窗 */
    .${uid}-save-dialog {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      padding: 24px;
      gap: 16px;
      transform: translateY(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 10;
      overscroll-behavior: contain;
      overflow-y: auto;
    }
    .${uid}-save-dialog.open {
      transform: translateY(0);
    }
    .${uid}-save-dialog-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .${uid}-input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .${uid}-input-label {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
    }
    .${uid}-input {
      width: 100%;
      padding: 9px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      transition: all 0.15s ease;
    }
    .${uid}-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }
    .${uid}-grid-preview {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 4px;
    }
    .${uid}-stat-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px;
      text-align: center;
    }
    .${uid}-stat-num {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 2px;
    }
    .${uid}-stat-label {
      font-size: 11px;
      color: #64748b;
    }

    /* Toast 提示 */
    .${uid}-toast {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-10px);
      background: #0f172a;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.3);
      opacity: 0;
      pointer-events: none;
      z-index: 2147483647;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .${uid}-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .${uid}-toast.success {
      background: #059669;
    }
    .${uid}-toast.error {
      background: #dc2626;
    }
    .${uid}-toast.info {
      background: #0f172a;
    }
  `;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.id = `${uid}-root`;
  wrapper.className = `${uid}-root`;
  wrapper.innerHTML = `
    <!-- 悬浮球 -->
    <div id="${uid}-ball" title="快照管理助手">
      <span class="${uid}-ball-close" title="更多选项">×</span>
      <div class="${uid}-badge" id="${uid}-badge" style="display: none;">0</div>
      <svg viewBox="0 0 24 24">
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm4.5 9c0 1.25-.8 2.25-2.5 2.5v.5h-4v-.5C8.3 18.25 7.5 17.25 7.5 16c0-1.66 2.01-3 4.5-3s4.5 1.34 4.5 3z"/>
      </svg>
    </div>

    <!-- 悬浮球快捷菜单 -->
    <div class="${uid}-menu-mask hidden" id="${uid}-menu-mask">
      <div class="${uid}-ball-menu">
        <div class="${uid}-ball-menu-title">🔑 快照管理助手</div>
        <button data-a="open">打开快照管理窗口</button>
        <button data-a="save">一键加密保存当前快照</button>
        <button data-a="temp">临时隐藏悬浮球（本次）</button>
        <button data-a="forever">永久关闭（从显示列表移除）</button>
      </div>
    </div>

    <!-- 主管理窗口 -->
    <div id="${uid}-window" class="hidden">
      <!-- 头部 -->
      <div id="${uid}-header">
        <div class="${uid}-header-left">
          <div class="${uid}-header-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>快照管理</span>
          </div>
          <span class="${uid}-domain-tag" title="${location.hostname}">${location.hostname}</span>
        </div>
        <div class="${uid}-header-actions">
          <button id="${uid}-btn-close" title="隐藏">×</button>
        </div>
      </div>

      <!-- 状态条 -->
      <div class="${uid}-status-bar">
        <div class="${uid}-status-item">
          <span class="${uid}-dot ${SessionManager.hasGmCookie() ? `${uid}-dot-green` : `${uid}-dot-amber`}"></span>
          <span>Cookie: ${SessionManager.hasGmCookie() ? "全量 (GM_cookie)" : "基础 (document.cookie)"}</span>
        </div>
        <div class="${uid}-status-item">
          <span class="${uid}-dot ${isEncryptionEnabled() ? `${uid}-dot-green` : `${uid}-dot-amber`}"></span>
          <span>存储加密: ${isEncryptionEnabled() ? "AES-GCM" : "明文"}</span>
        </div>
      </div>

      <!-- 操作工具栏 -->
      <div class="${uid}-toolbar">
        <div class="${uid}-toolbar-row">
          <button class="${uid}-btn ${uid}-btn-primary" id="${uid}-btn-save-current" style="flex: 1;" title="一键保存当前快照">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>一键保存</span>
          </button>
          <button class="${uid}-btn ${uid}-btn-danger" id="${uid}-btn-clear-current" title="清空当前网站所有Cookie及Storage数据">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>清空数据</span>
          </button>
          <button class="${uid}-btn ${uid}-btn-secondary" id="${uid}-btn-reload" title="刷新页面以生效">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>刷新</span>
          </button>
          <!-- 更多操作下拉按钮 -->
          <div class="${uid}-dropdown-wrapper">
            <button class="${uid}-btn ${uid}-btn-secondary ${uid}-btn-icon" id="${uid}-btn-more" title="更多导入导出与恢复选项">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1.5"></circle>
                <circle cx="19" cy="12" r="1.5"></circle>
                <circle cx="5" cy="12" r="1.5"></circle>
              </svg>
            </button>
            <div class="${uid}-dropdown-menu hidden" id="${uid}-dropdown-menu">
              <div class="${uid}-dropdown-item" id="${uid}-btn-export-all">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>批量导出记录</span>
              </div>
              <div class="${uid}-dropdown-item" id="${uid}-btn-import-all">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>批量导入记录</span>
              </div>
              <div class="${uid}-dropdown-divider"></div>
              <div class="${uid}-dropdown-item ${uid}-item-accent" id="${uid}-btn-restore-file">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                </svg>
                <span>从文件恢复(不导入)</span>
              </div>
              <div class="${uid}-dropdown-item" id="${uid}-btn-restore-clipboard" style="color: #0284c7; font-weight: 500;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>从剪贴板恢复(免文件)</span>
              </div>
            </div>
          </div>
        </div>
        <!-- 搜索过滤条 -->
        <div class="${uid}-search-wrap">
          <svg class="${uid}-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" class="${uid}-search-input" id="${uid}-search-input" placeholder="搜索快照名称或时间..." />
          <button class="${uid}-search-clear hidden" id="${uid}-search-clear" title="清空搜索">✕</button>
        </div>
      </div>
      <!-- 隐藏的文件选择器 -->
      <input type="file" id="${uid}-file-import" accept=".json" style="display: none;" />
      <input type="file" id="${uid}-file-restore-direct" accept=".json" style="display: none;" />

      <!-- 列表区 -->
      <div class="${uid}-content" id="${uid}-list"></div>

      <!-- 保存抽屉对话框 -->
      <div class="${uid}-save-dialog" id="${uid}-save-dialog">
        <div class="${uid}-save-dialog-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          <span>保存当前快照</span>
        </div>
        <div class="${uid}-input-group">
          <label class="${uid}-input-label">记录名称</label>
          <input type="text" class="${uid}-input" id="${uid}-input-name" placeholder="请输入自定义名称" />
        </div>
        <div class="${uid}-input-group">
          <label class="${uid}-input-label">凭据扫描预览</label>
          <div id="${uid}-preview-box">
            <div style="font-size: 12px; color: #64748b;">正在扫描当前页面快照凭据...</div>
          </div>
        </div>
        <div style="margin-top: auto; display: flex; justify-content: flex-end; gap: 8px;">
          <button class="${uid}-btn ${uid}-btn-secondary" id="${uid}-btn-cancel-save">取消</button>
          <button class="${uid}-btn ${uid}-btn-primary" id="${uid}-btn-confirm-save">确认加密保存</button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div class="${uid}-toast" id="${uid}-toast"></div>
  `;
  shadow.appendChild(wrapper);

  // -----------------------------------------------------------------------
  // DOM 元素引用与 UI 控制器
  // -----------------------------------------------------------------------
  const ball = shadow.getElementById(`${uid}-ball`);
  const win = shadow.getElementById(`${uid}-window`);
  const header = shadow.getElementById(`${uid}-header`);
  const menuMask = shadow.getElementById(`${uid}-menu-mask`);
  const badge = shadow.getElementById(`${uid}-badge`);
  const listEl = shadow.getElementById(`${uid}-list`);
  const saveDialog = shadow.getElementById(`${uid}-save-dialog`);
  const inputName = shadow.getElementById(`${uid}-input-name`);
  const previewBox = shadow.getElementById(`${uid}-preview-box`);
  const toastEl = shadow.getElementById(`${uid}-toast`);

  let tempCapturedData = null;
  let toastTimer = null;

  function showToast(msg, type = "info") {
    toastEl.textContent = msg;
    toastEl.className = `${uid}-toast ${type} show`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 3000);
  }

  // -----------------------------------------------------------------------
  // 位置持久化
  // -----------------------------------------------------------------------
  function getUIPositions() {
    return GM_getValue("lsm_ui_positions", {});
  }

  function saveUIPos() {
    try {
      const allPos = getUIPositions();
      const hostKey = location.hostname;
      const cur = allPos[hostKey] || {};

      const br = ball.getBoundingClientRect();
      if (br.width > 0 && br.height > 0) {
        cur.ball = { x: Math.round(br.left), y: Math.round(br.top) };
      }

      const wr = win.getBoundingClientRect();
      if (wr.width > 0 && wr.height > 0) {
        cur.win = { x: Math.round(wr.left), y: Math.round(wr.top) };
      }

      allPos[hostKey] = cur;
      GM_setValue("lsm_ui_positions", allPos);
    } catch {}
  }

  function restoreUIPos() {
    try {
      const allPos = getUIPositions();
      const cur = allPos[location.hostname];
      if (!cur) return;

      if (cur.ball && typeof cur.ball.x === "number") {
        const x = Math.max(10, Math.min(window.innerWidth - 60, cur.ball.x));
        const y = Math.max(10, Math.min(window.innerHeight - 60, cur.ball.y));
        ball.style.left = x + "px";
        ball.style.top = y + "px";
        ball.style.right = "auto";
        ball.style.bottom = "auto";
      }

      if (cur.win && typeof cur.win.x === "number") {
        const x = Math.max(10, Math.min(window.innerWidth - 490, cur.win.x));
        const y = Math.max(10, Math.min(window.innerHeight - 530, cur.win.y));
        win.style.left = x + "px";
        win.style.top = y + "px";
        win.style.right = "auto";
        win.style.bottom = "auto";
      }
    } catch {}
  }

  // -----------------------------------------------------------------------
  // 拖拽逻辑
  // -----------------------------------------------------------------------
  function makeDraggable(el, handle, onClick) {
    let dragging = false,
      moved = false,
      sx,
      sy,
      sLeft,
      sTop;

    handle.addEventListener("mousedown", (e) => {
      const tag = e.target.tagName;
      if (["BUTTON", "SELECT", "TEXTAREA", "INPUT"].includes(tag)) return;
      if (e.target.closest && e.target.closest(`.${uid}-ball-close`)) return;

      dragging = true;
      moved = false;
      const rect = el.getBoundingClientRect();
      sx = e.clientX;
      sy = e.clientY;
      sLeft = rect.left;
      sTop = rect.top;
      handle.classList.add("dragging");
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      if (!moved) return;

      let nl = Math.max(0, Math.min(sLeft + dx, window.innerWidth - el.offsetWidth));
      let nt = Math.max(0, Math.min(sTop + dy, window.innerHeight - el.offsetHeight));
      el.style.left = nl + "px";
      el.style.top = nt + "px";
      el.style.right = "auto";
      el.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("dragging");
      if (moved) {
        if (el === ball) {
          // 悬浮球松手后智能平滑贴边吸附
          const curLeft = el.offsetLeft;
          const ballWidth = el.offsetWidth || 50;
          const winWidth = window.innerWidth;
          const margin = 12;
          const targetLeft = curLeft + ballWidth / 2 < winWidth / 2 ? margin : winWidth - ballWidth - margin;
          el.style.left = targetLeft + "px";
          const curTop = Math.max(margin, Math.min(el.offsetTop, window.innerHeight - (el.offsetHeight || 50) - margin));
          el.style.top = curTop + "px";
          setTimeout(saveUIPos, 350);
        } else {
          saveUIPos();
        }
      }
      if (!moved && onClick) onClick();
    });
  }

  // -----------------------------------------------------------------------
  // 当前生效快照状态管理
  // -----------------------------------------------------------------------
  function getActiveRecordId() {
    return GM_getValue("lsm_active_" + location.hostname, "");
  }

  function setActiveRecordId(id) {
    GM_setValue("lsm_active_" + location.hostname, id || "");
  }

  // -----------------------------------------------------------------------
  // UI 窗口交互与记录列表渲染
  // -----------------------------------------------------------------------
  function refreshList(keyword) {
    const allRecords = DB.getRecords();
    const activeId = getActiveRecordId();

    if (allRecords.length > 0) {
      badge.textContent = allRecords.length > 99 ? "99+" : allRecords.length;
      badge.style.display = "flex";
    } else {
      badge.style.display = "none";
    }

    const filterText = String(keyword !== undefined ? keyword : (shadow.getElementById(`${uid}-search-input`) ? shadow.getElementById(`${uid}-search-input`).value : "")).trim().toLowerCase();
    
    let records = allRecords;
    if (filterText) {
      records = allRecords.filter((r) => {
        const nameMatch = (r.name || "").toLowerCase().includes(filterText);
        const timeMatch = formatTime(r.createdAt).includes(filterText);
        const urlMatch = (r.url || "").toLowerCase().includes(filterText);
        return nameMatch || timeMatch || urlMatch;
      });
    }

    if (allRecords.length === 0) {
      listEl.innerHTML = `
        <div class="${uid}-empty">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
          </svg>
          <div>当前网站暂无已保存的快照信息</div>
          <div style="font-size: 11px;">点击上方“一键保存”即可快速备份</div>
        </div>
      `;
      return;
    }

    if (records.length === 0 && filterText) {
      listEl.innerHTML = `
        <div class="${uid}-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div>未找到匹配的快照记录</div>
          <div style="font-size: 11px;">可尝试更换关键词或点击清空搜索</div>
        </div>
      `;
      return;
    }

    let html = "";
    records.forEach((r) => {
      const cookieCount = r.summary ? r.summary.cookieCount : "?";
      const localCount = r.summary ? r.summary.localCount : "?";
      const sessionCount = r.summary ? r.summary.sessionCount : "?";
      const isActive = r.id === activeId;

      html += `
        <div class="${uid}-card ${isActive ? `${uid}-card-active` : ""}" data-id="${r.id}">
          <div class="${uid}-card-header">
            <span class="${uid}-card-name" title="${escapeHtml(r.name)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isActive ? "#16a34a" : "#2563eb"}" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              ${escapeHtml(r.name)}
              ${isActive ? `<span class="${uid}-badge-active">✓ 当前生效</span>` : ""}
            </span>
            <span class="${uid}-card-time">${formatTime(r.createdAt)}</span>
          </div>
          <div class="${uid}-card-chips">
            <span class="${uid}-chip ${uid}-chip-cookie">🍪 Cookie: ${cookieCount}</span>
            <span class="${uid}-chip ${uid}-chip-local">💾 Local: ${localCount}</span>
            <span class="${uid}-chip ${uid}-chip-session">📦 Session: ${sessionCount}</span>
            <span class="${uid}-chip ${uid}-chip-encrypted">🔒 ${r.cipherData && r.cipherData.encrypted ? "AES-GCM" : "明文"}</span>
          </div>
          ${
            r.url
              ? `<div class="${uid}-card-origin">
                  <span style="font-weight: 500;">来源:</span>
                  <a class="${uid}-card-url" href="${escapeHtml(r.url)}" title="保存来源页面：${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 2px;">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>${escapeHtml(r.url)}
                  </a>
                </div>`
              : ""
          }
          <div class="${uid}-card-actions">
            <button class="${uid}-btn ${uid}-btn-primary ${uid}-btn-sm btn-restore" data-id="${r.id}" data-url="${escapeHtml(r.url || "")}">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M8 16H3v5"></path>
              </svg>
              一键恢复
            </button>
            <button class="${uid}-btn ${uid}-btn-secondary ${uid}-btn-sm btn-copy-single" data-id="${r.id}" title="一键复制加密快照至剪贴板">
              复制
            </button>
            <button class="${uid}-btn ${uid}-btn-secondary ${uid}-btn-sm btn-export-single" data-id="${r.id}" title="导出此单条记录为独立 JSON 文件">
              导出
            </button>
            <button class="${uid}-btn ${uid}-btn-secondary ${uid}-btn-sm btn-rename" data-id="${r.id}" data-name="${escapeHtml(r.name)}">
              重命名
            </button>
            <button class="${uid}-btn ${uid}-btn-danger ${uid}-btn-sm btn-delete" data-id="${r.id}" data-name="${escapeHtml(r.name)}">
              删除
            </button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;

    listEl.querySelectorAll(".btn-restore").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const originUrl = btn.getAttribute("data-url");
        try {
          showToast("正在解密并恢复快照...", "info");
          const sessionData = await DB.getDecryptedSession(id);
          const res = await SessionManager.restoreSession(sessionData);
          CryptoEngine.wipeMemory(sessionData);
          setActiveRecordId(id);
          refreshList();
          showToast(`恢复成功: Cookie ${res.cookieSuccessCount}个, Storage ${res.localCount + res.sessionCount}项`, "success");
          
          setTimeout(() => {
            const hasSpecificUrl = originUrl && originUrl.startsWith("http") && originUrl !== location.href;
            const targetJumpUrl = hasSpecificUrl ? originUrl : location.href;

            if (isAutoReloadEnabled()) {
              if (hasSpecificUrl) {
                location.href = targetJumpUrl;
              } else {
                location.reload();
              }
              return;
            }

            const confirmMsg = hasSpecificUrl
              ? `快照已恢复！\n检测到该记录保存自页面：\n${originUrl}\n\n是否立即跳转/刷新至该页面以应用快照？`
              : "快照已恢复！是否立即刷新网页以应用快照？";

            if (confirm(confirmMsg)) {
              if (hasSpecificUrl) {
                location.href = originUrl;
              } else {
                location.reload();
              }
            }
          }, 300);
        } catch (e) {
          showToast(`恢复失败: ${e.message}`, "error");
        }
      });
    });

    listEl.querySelectorAll(".btn-copy-single").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const records = DB.getRecords();
        const target = records.find((r) => r.id === id);
        if (!target) {
          showToast("未找到对应快照记录", "error");
          return;
        }
        const exportData = {
          type: "LSM_SINGLE_EXPORT",
          version: "1.1.0",
          domain: target.domain || location.hostname,
          exportTime: Date.now(),
          record: target
        };
        try {
          GM_setClipboard(JSON.stringify(exportData, null, 2), "text");
          showToast(`快照「${target.name}」已复制至剪贴板！`, "success");
        } catch (err) {
          showToast(`复制失败: ${err.message}`, "error");
        }
      });
    });

    listEl.querySelectorAll(".btn-export-single").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const records = DB.getRecords();
        const target = records.find((r) => r.id === id);
        if (!target) {
          showToast("未找到对应记录", "error");
          return;
        }
        const exportData = {
          type: "LSM_SINGLE_EXPORT",
          version: "1.1.0",
          domain: location.hostname,
          exportTime: Date.now(),
          record: target
        };
        const safeName = (target.name || "session").replace(/[\\/:*?"<>|]/g, "_");
        downloadJsonFile(`${location.hostname}_${safeName}.json`, exportData);
        showToast("单条记录已导出为 JSON", "success");
      });
    });

    listEl.querySelectorAll(".btn-rename").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const oldName = btn.getAttribute("data-name");
        const newName = prompt("请输入新的记录名称：", oldName);
        if (newName && newName.trim() && newName.trim() !== oldName) {
          DB.updateRecordName(id, newName.trim());
          refreshList();
          showToast("已重命名", "success");
        }
      });
    });

    listEl.querySelectorAll(".btn-delete").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const name = btn.getAttribute("data-name");
        if (confirm(`确定要删除记录 [${name}] 吗？`)) {
          DB.deleteRecord(id);
          if (getActiveRecordId() === id) {
            setActiveRecordId("");
          }
          refreshList();
          showToast("已删除记录", "info");
        }
      });
    });
  }

  async function openSaveDialog() {
    inputName.value = getDefaultName();
    previewBox.innerHTML = `<span style="color: #64748b; font-size: 12px;">正在扫描当前快照...</span>`;
    saveDialog.classList.add("open");

    // 自动聚焦并全选输入框
    setTimeout(() => {
      inputName.focus();
      inputName.select();
    }, 50);

    try {
      const data = await SessionManager.captureCurrentSession();
      tempCapturedData = data;
      const sizeKb = data.summary.approxBytes ? (data.summary.approxBytes / 1024).toFixed(1) : "0";
      const isTooLarge = data.summary.approxBytes && data.summary.approxBytes > 1.5 * 1024 * 1024;

      previewBox.innerHTML = `
        <div class="${uid}-grid-preview">
          <div class="${uid}-stat-box" style="border-color: #fde68a; background: #fffbeb;">
            <div class="${uid}-stat-label" style="color: #b45309;">🍪 Cookie</div>
            <div class="${uid}-stat-num" style="color: #92400e;">${data.summary.cookieCount}</div>
          </div>
          <div class="${uid}-stat-box" style="border-color: #bbf7d0; background: #f0fdf4;">
            <div class="${uid}-stat-label" style="color: #15803d;">💾 Local</div>
            <div class="${uid}-stat-num" style="color: #166534;">${data.summary.localCount}</div>
          </div>
          <div class="${uid}-stat-box" style="border-color: #e9d5ff; background: #faf5ff;">
            <div class="${uid}-stat-label" style="color: #7e22ce;">📦 Session</div>
            <div class="${uid}-stat-num" style="color: #6b21a8;">${data.summary.sessionCount}</div>
          </div>
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: ${isTooLarge ? "#b45309" : "#64748b"}; display: flex; align-items: center; justify-content: space-between;">
          <span>预估体积: <strong>${sizeKb} KB</strong></span>
          ${isTooLarge ? '<span style="color: #e11d48; font-weight: 600;">⚠️ 快照体积偏大 (>1.5MB)</span>' : '<span style="color: #10b981;">✓ 状态良好</span>'}
        </div>
      `;
    } catch (e) {
      previewBox.innerHTML = `<span style="color: #dc2626; font-size: 12px;">扫描异常: ${e.message}</span>`;
    }
  }

  function closeSaveDialog() {
    saveDialog.classList.remove("open");
    if (tempCapturedData) {
      CryptoEngine.wipeMemory(tempCapturedData);
      tempCapturedData = null;
    }
  }

  function openWindow() {
    if (ball) {
      ball.style.display = "none";
      ball.classList.add("hidden");
    }
    if (win) {
      win.style.display = "flex";
      win.classList.remove("hidden");
      refreshList();
    }
  }

  function closeWindow() {
    if (win) {
      win.style.display = "none";
      win.classList.add("hidden");
    }
    if (ball) {
      ball.style.display = "flex";
      ball.classList.remove("hidden");
    }
    closeSaveDialog();
  }

  // -----------------------------------------------------------------------
  // 事件绑定
  // -----------------------------------------------------------------------
  makeDraggable(ball, ball, () => openWindow());
  makeDraggable(win, header);

  // 阻止弹窗内滚动穿透到宿主网页
  win.addEventListener(
    "wheel",
    (e) => {
      e.stopPropagation();
      const scrollable = e.target.closest(`.${uid}-content, .${uid}-save-dialog`);
      if (!scrollable) {
        e.preventDefault();
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = scrollable;
      const deltaY = e.deltaY;
      const isUp = deltaY < 0;
      const isDown = deltaY > 0;
      if (isUp && scrollTop <= 0) {
        e.preventDefault();
      } else if (isDown && scrollTop + clientHeight >= scrollHeight - 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  menuMask.addEventListener(
    "wheel",
    (e) => {
      e.stopPropagation();
      e.preventDefault();
    },
    { passive: false }
  );

  // 悬浮球右上角菜单
  shadow.querySelector(`.${uid}-ball-close`).addEventListener("click", (e) => {
    e.stopPropagation();
    menuMask.classList.remove("hidden");
  });

  menuMask.addEventListener("click", (e) => {
    if (e.target === menuMask) menuMask.classList.add("hidden");
  });

  menuMask.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      menuMask.classList.add("hidden");
      const action = btn.getAttribute("data-a");
      if (action === "open") {
        openWindow();
      } else if (action === "save") {
        openWindow();
        openSaveDialog();
      } else if (action === "temp") {
        ball.style.display = "none";
        win.style.display = "none";
        win.classList.add("hidden");
      } else if (action === "forever") {
        removeHostFromShowList();
        ball.style.display = "none";
        win.style.display = "none";
        win.classList.add("hidden");
      }
    });
  });

  // 窗口顶部操作
  shadow.getElementById(`${uid}-btn-close`).addEventListener("click", () => closeWindow());

  // 工具栏操作
  shadow.getElementById(`${uid}-btn-save-current`).addEventListener("click", () => openSaveDialog());
  shadow.getElementById(`${uid}-btn-clear-current`).addEventListener("click", async () => {
    if (confirm(`确定要清空当前网站 (${location.hostname}) 的所有快照数据（Cookie、LocalStorage、SessionStorage）吗？\n清空后将处于未快照。`)) {
      showToast("正在清空当前网站数据...", "info");
      try {
        const res = await SessionManager.clearAllData();
        setActiveRecordId("");
        refreshList();
        showToast(`已清空 Cookie ${res.cookieCount}个, Storage ${res.storageCount}项`, "success");
        setTimeout(() => {
          if (confirm("当前网站快照数据已彻底清空！是否立即刷新网页以生效？")) {
            location.reload();
          }
        }, 300);
      } catch (e) {
        showToast(`清空失败: ${e.message}`, "error");
      }
    }
  });
  shadow.getElementById(`${uid}-btn-reload`).addEventListener("click", () => location.reload());

  // 搜索过滤框事件绑定
  const searchInput = shadow.getElementById(`${uid}-search-input`);
  const searchClearBtn = shadow.getElementById(`${uid}-search-clear`);

  searchInput.addEventListener("input", () => {
    const val = searchInput.value;
    searchClearBtn.classList.toggle("hidden", !val);
    refreshList(val);
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchClearBtn.classList.add("hidden");
    searchInput.focus();
    refreshList("");
  });

  // 更多操作下拉菜单
  const btnMore = shadow.getElementById(`${uid}-btn-more`);
  const dropdownMenu = shadow.getElementById(`${uid}-dropdown-menu`);
  btnMore.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle("hidden");
  });

  // 点击外部收起下拉菜单
  wrapper.addEventListener("click", (e) => {
    if (!dropdownMenu.classList.contains("hidden") && !btnMore.contains(e.target)) {
      dropdownMenu.classList.add("hidden");
    }
  });

  // 批量导出
  shadow.getElementById(`${uid}-btn-export-all`).addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    const records = DB.getRecords();
    if (!records.length) {
      showToast("当前网站暂无可导出的记录", "info");
      return;
    }
    const exportData = {
      type: "LSM_BATCH_EXPORT",
      version: "1.0",
      domain: location.hostname,
      exportTime: Date.now(),
      count: records.length,
      records: records
    };
    downloadJsonFile(`${location.hostname}_all_sessions.json`, exportData);
    showToast(`成功导出 ${records.length} 条记录`, "success");
  });

  // 批量导入
  const fileImportInput = shadow.getElementById(`${uid}-file-import`);
  shadow.getElementById(`${uid}-btn-import-all`).addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    fileImportInput.value = "";
    fileImportInput.click();
  });
  fileImportInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      showToast("正在读取导入文件...", "info");
      const json = await readFileAsJson(file);
      let toImport = [];
      let fileDomain = json.domain || "";

      if (json.type === "LSM_BATCH_EXPORT" && Array.isArray(json.records)) {
        toImport = json.records;
      } else if (json.type === "LSM_SINGLE_EXPORT" && json.record) {
        toImport = [json.record];
        fileDomain = json.record.domain || fileDomain;
      } else if (Array.isArray(json)) {
        toImport = json;
      } else if (json.name && json.cipherData) {
        toImport = [json];
        fileDomain = json.domain || fileDomain;
      } else {
        throw new Error("无法识别的备份文件结构");
      }

      // 检测跨域名
      if (fileDomain && fileDomain !== location.hostname) {
        const proceed = confirm(
          `⚠️ 域名不匹配提示：\n\n该备份文件来源网站为：[${fileDomain}]\n而当前所在网站为：[${location.hostname}]\n\n跨网站导入可能导致快照无法生效或无法直接解密。是否仍要继续导入到当前网站？`
        );
        if (!proceed) {
          showToast("已取消导入", "info");
          return;
        }
      }

      const { count, skipped } = DB.importRecords(toImport);
      refreshList();
      if (count === 0 && skipped > 0) {
        showToast(`检测到 ${skipped} 条快照数据已存在，已全部自动跳过`, "info");
      } else if (skipped > 0) {
        showToast(`成功导入 ${count} 条快照，已自动跳过 ${skipped} 条重复记录`, "success");
      } else {
        showToast(`成功导入 ${count} 条快照记录！`, "success");
      }
    } catch (err) {
      showToast(`导入失败: ${err.message}`, "error");
    }
  });

  // -----------------------------------------------------------------------
  // 快照通用直接恢复引擎（支持文件直接恢复、剪贴板恢复、Ctrl+V 粘贴触发）
  // -----------------------------------------------------------------------
  async function restoreSnapshotData(json, defaultName) {
    let targetCipher = null;
    let targetUrl = "";
    let targetName = defaultName || "";
    let fileDomain = json.domain || "";

    if (json.type === "LSM_SINGLE_EXPORT" && json.record) {
      targetCipher = json.record.cipherData;
      targetUrl = json.record.url || "";
      targetName = json.record.name || targetName;
      fileDomain = json.record.domain || fileDomain;
    } else if (json.type === "LSM_BATCH_EXPORT" && Array.isArray(json.records) && json.records.length > 0) {
      targetCipher = json.records[0].cipherData;
      targetUrl = json.records[0].url || "";
      targetName = json.records[0].name || targetName;
      fileDomain = json.records[0].domain || fileDomain;
    } else if (json.name && json.cipherData) {
      targetCipher = json.cipherData;
      targetUrl = json.url || "";
      targetName = json.name || targetName;
      fileDomain = json.domain || fileDomain;
    } else if (json.cookies || json.localStorage) {
      targetCipher = { encrypted: false, payload: JSON.stringify(json) };
      targetUrl = json.url || "";
      fileDomain = json.domain || fileDomain;
    } else {
      throw new Error("无法识别的快照数据格式");
    }

    if (!targetCipher) throw new Error("快照数据中缺少有效凭据");

    // 检测跨域名
    if (fileDomain && fileDomain !== location.hostname) {
      const proceed = confirm(
        `⚠️ 域名不匹配提示：\n\n该快照来源网站为：[${fileDomain}]\n而当前所在网站为：[${location.hostname}]\n\n跨网站恢复可能导致当前网站无法识别该快照。是否仍要继续恢复？`
      );
      if (!proceed) {
        showToast("已取消恢复", "info");
        return;
      }
    }

    showToast("正在解密并恢复快照...", "info");
    const recDomain = fileDomain || location.hostname;
    const sessionData = await CryptoEngine.decrypt(targetCipher, recDomain);
    const res = await SessionManager.restoreSession(sessionData);
    CryptoEngine.wipeMemory(sessionData);
    setActiveRecordId("");
    refreshList();
    showToast(`恢复成功: Cookie ${res.cookieSuccessCount}个, Storage ${res.localCount + res.sessionCount}项`, "success");

    setTimeout(() => {
      const hasSpecificUrl = targetUrl && targetUrl.startsWith("http") && targetUrl !== location.href;
      const targetJumpUrl = hasSpecificUrl ? targetUrl : location.href;

      if (isAutoReloadEnabled()) {
        if (hasSpecificUrl) {
          location.href = targetJumpUrl;
        } else {
          location.reload();
        }
        return;
      }

      const confirmMsg = hasSpecificUrl
        ? `快照 [${targetName || "已选择"}] 已恢复！\n检测到该记录保存自页面：\n${targetUrl}\n\n是否立即跳转/刷新至该页面以应用快照？`
        : `快照 [${targetName || "已选择"}] 已恢复！是否立即刷新网页以应用快照？`;

      if (confirm(confirmMsg)) {
        if (hasSpecificUrl) {
          location.href = targetUrl;
        } else {
          location.reload();
        }
      }
    }, 300);
  }

  // 从文件恢复（不导入）
  const fileRestoreDirectInput = shadow.getElementById(`${uid}-file-restore-direct`);
  shadow.getElementById(`${uid}-btn-restore-file`).addEventListener("click", () => {
    dropdownMenu.classList.add("hidden");
    fileRestoreDirectInput.value = "";
    fileRestoreDirectInput.click();
  });
  fileRestoreDirectInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      showToast("正在解析备份文件...", "info");
      const json = await readFileAsJson(file);
      await restoreSnapshotData(json, file.name);
    } catch (err) {
      showToast(`恢复失败: ${err.message}`, "error");
    }
  });

  // 从剪贴板恢复（免文件）
  shadow.getElementById(`${uid}-btn-restore-clipboard`).addEventListener("click", async () => {
    dropdownMenu.classList.add("hidden");
    try {
      let text = "";
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = prompt("请在此粘贴快照 JSON 数据：") || "";
      }
      if (!text || !text.trim()) {
        showToast("未获取到剪贴板文本，请先复制快照数据", "info");
        return;
      }

      let json;
      try {
        json = JSON.parse(text.trim());
      } catch {
        throw new Error("剪贴板内容不是合法的 JSON 快照数据");
      }

      await restoreSnapshotData(json, "剪贴板快照");
    } catch (err) {
      showToast(`剪贴板恢复失败: ${err.message}`, "error");
    }
  });

  // 监听全局 Ctrl+V / Paste 事件，仅在管理窗口打开时响应，检测到快照 JSON 直接触发恢复
  window.addEventListener(
    "paste",
    async (e) => {
      // 只有在管理窗口处于激活显示状态时才响应快捷快照粘贴，避免干扰正常浏览网页时的日常粘贴
      if (win.classList.contains("hidden") || win.style.display === "none") return;

      const activeEl = shadow.activeElement || document.activeElement;
      // 如果焦点在快照重命名/自定义命名的 input 输入框内，且粘贴的不是包含快照特征的 JSON，则正常粘贴
      const isRenameInput = activeEl && activeEl.id === `${uid}-input-name`;

      let text = "";
      if (e.clipboardData) {
        text = e.clipboardData.getData("text");
      }
      if (!text || typeof text !== "string") return;

      const trimmed = text.trim();
      if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return;

      try {
        const json = JSON.parse(trimmed);
        const isSnapshot =
          (json.type === "LSM_SINGLE_EXPORT" && json.record) ||
          (json.type === "LSM_BATCH_EXPORT" && Array.isArray(json.records) && json.records.length > 0) ||
          (json.name && json.cipherData) ||
          (json.cipherData && json.cipherData.ciphertext) ||
          (json.summary && (json.cookies || json.localStorage));

        if (!isSnapshot) return;

        // 如果是在输入框中，且用户粘贴的是合法的快照，才拦截默认粘贴
        e.preventDefault();
        e.stopPropagation();

        const targetName =
          (json.record && json.record.name) ||
          json.name ||
          (json.records && json.records[0] && json.records[0].name) ||
          "剪贴板快照";

        const originDomain = json.domain || (json.record && json.record.domain) || "";
        const domainTip = originDomain && originDomain !== location.hostname ? `\n(⚠️ 来源域名: ${originDomain}，当前域名: ${location.hostname})` : "";

        const confirmRestore = confirm(
          `📋 检测到您在管理面板中粘贴了快照数据 [${targetName}]！${domainTip}\n\n是否立即解密并恢复此快照到当前网站？`
        );
        if (confirmRestore) {
          await restoreSnapshotData(json, targetName);
        }
      } catch (err) {
        // 忽略非快照数据解析错误
      }
    },
    true
  );

  // 保存弹窗操作
  const btnConfirmSave = shadow.getElementById(`${uid}-btn-confirm-save`);
  shadow.getElementById(`${uid}-btn-cancel-save`).addEventListener("click", () => closeSaveDialog());

  btnConfirmSave.addEventListener("click", async () => {
    const name = inputName.value.trim() || getDefaultName();
    if (!tempCapturedData) {
      showToast("未检测到有效数据，请重新打开", "error");
      return;
    }
    try {
      const newRec = await DB.addRecord(name, tempCapturedData);
      tempCapturedData = null;
      if (newRec && newRec.id) {
        setActiveRecordId(newRec.id);
      }
      closeSaveDialog();
      refreshList();
      showToast("快照信息已安全加密保存！", "success");
    } catch (e) {
      showToast(`保存失败: ${e.message}`, "error");
    }
  });

  // 保存抽屉按键事件（无论焦点是否在输入框均生效）
  window.addEventListener(
    "keydown",
    (e) => {
      // 仅在主管理窗口可见且保存抽屉处于打开状态时响应
      if (win.classList.contains("hidden") || win.style.display === "none") return;
      if (!saveDialog.classList.contains("open")) return;

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        btnConfirmSave.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeSaveDialog();
      }
    },
    true
  );

  // 初始化位置与列表
  restoreUIPos();
  refreshList();

  // 视口 Resize 时防止悬浮球和管理窗口溢出屏幕
  window.addEventListener("resize", () => {
    try {
      if (ball && ball.style.display !== "none" && !ball.classList.contains("hidden")) {
        const br = ball.getBoundingClientRect();
        if (br.left + br.width > window.innerWidth || br.top + br.height > window.innerHeight) {
          const maxLeft = Math.max(10, window.innerWidth - (ball.offsetWidth || 50) - 12);
          const maxTop = Math.max(10, window.innerHeight - (ball.offsetHeight || 50) - 12);
          ball.style.left = Math.min(br.left, maxLeft) + "px";
          ball.style.top = Math.min(br.top, maxTop) + "px";
        }
      }
      if (win && win.style.display !== "none" && !win.classList.contains("hidden")) {
        const wr = win.getBoundingClientRect();
        if (wr.left + wr.width > window.innerWidth || wr.top + wr.height > window.innerHeight) {
          const maxLeft = Math.max(10, window.innerWidth - (win.offsetWidth || 480) - 20);
          const maxTop = Math.max(10, window.innerHeight - (win.offsetHeight || 520) - 20);
          win.style.left = Math.min(wr.left, maxLeft) + "px";
          win.style.top = Math.min(wr.top, maxTop) + "px";
        }
      }
    } catch {}
  });

  // SPA 单页应用路由切换感知 (History API / Hash)
  const handleRouteChange = () => {
    // 如果窗口正在展示且保存抽屉处于开启状态，动态刷新默认命名
    if (saveDialog && saveDialog.classList.contains("open") && inputName) {
      const currentVal = inputName.value;
      if (currentVal.startsWith("快照_") || !currentVal) {
        inputName.value = getDefaultName();
      }
    }
  };

  window.addEventListener("popstate", handleRouteChange);
  window.addEventListener("hashchange", handleRouteChange);

  if (!window.__LSM_HISTORY_HOOKED__) {
    window.__LSM_HISTORY_HOOKED__ = true;
    const rawPushState = history.pushState;
    if (typeof rawPushState === "function") {
      history.pushState = function (...args) {
        const ret = rawPushState.apply(this, args);
        handleRouteChange();
        return ret;
      };
    }

    const rawReplaceState = history.replaceState;
    if (typeof rawReplaceState === "function") {
      history.replaceState = function (...args) {
        const ret = rawReplaceState.apply(this, args);
        handleRouteChange();
        return ret;
      };
    }
  }

  // 暴露给全局控制器
  LSM_UI = {
    ball,
    win,
    openWindow,
    closeWindow
  };
}
