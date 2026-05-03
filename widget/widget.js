(function () {
  "use strict";

  var config = {
    apiUrl: document.currentScript
      ? document.currentScript.getAttribute("data-api-url") || "/api/chat"
      : "/api/chat",
    primaryColor: document.currentScript
      ? document.currentScript.getAttribute("data-color") || "#1a56db"
      : "#1a56db",
    agentName: "Alona",
    welcomeMessage: "Hallo! Ik ben Alona, uw assistent van Van Gestel Kozijnen & Installaties. Hoe kan ik u helpen? 😊",
  };

  var SESSION_KEY = "vg_chat_session_id";
  var sessionId = localStorage.getItem(SESSION_KEY) || null;
  var isOpen = false;
  var isLoading = false;

  // ── Styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    var css = [
      /* Container */
      "#vg-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; position: fixed; bottom: 24px; right: 24px; z-index: 99999; display: flex; flex-direction: column; align-items: flex-end; }",

      /* Chat window */
      "#vg-window { display: none; flex-direction: column; width: 360px; height: 520px; background: #fff; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.18); overflow: hidden; margin-bottom: 12px; }",
      "#vg-window.vg-open { display: flex; animation: vgSlideUp .22s ease; }",
      "@keyframes vgSlideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }",

      /* Header */
      "#vg-header { background: " + config.primaryColor + "; color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }",
      "#vg-avatar { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,.25); display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }",
      "#vg-header-info { flex: 1; min-width: 0; }",
      "#vg-header-name { font-weight: 700; font-size: 15px; line-height: 1.2; }",
      "#vg-header-sub { font-size: 11px; opacity: .8; margin-top: 1px; }",
      "#vg-close-btn { background: none; border: none; color: #fff; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; align-items: center; justify-content: center; opacity: .8; transition: opacity .15s; flex-shrink: 0; }",
      "#vg-close-btn:hover { opacity: 1; }",

      /* Messages */
      "#vg-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: #f7f8fc; scroll-behavior: smooth; }",
      "#vg-messages::-webkit-scrollbar { width: 4px; }",
      "#vg-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }",

      /* Bubbles */
      ".vg-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 86%; }",
      ".vg-msg.vg-agent { align-self: flex-start; }",
      ".vg-msg.vg-user { align-self: flex-end; flex-direction: row-reverse; }",
      ".vg-bubble { padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-break: break-word; }",
      ".vg-agent .vg-bubble { background: #fff; color: #1f2937; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }",
      ".vg-user .vg-bubble { background: " + config.primaryColor + "; color: #fff; border-bottom-right-radius: 4px; }",
      ".vg-time { font-size: 10px; color: #9ca3af; margin-top: 3px; white-space: nowrap; flex-shrink: 0; align-self: flex-end; }",
      ".vg-agent .vg-time { margin-left: 2px; }",
      ".vg-user .vg-time { margin-right: 2px; }",

      /* Typing indicator */
      ".vg-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; background: #fff; border-radius: 16px; border-bottom-left-radius: 4px; box-shadow: 0 1px 4px rgba(0,0,0,.08); width: fit-content; }",
      ".vg-dot { width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; animation: vgBounce 1.2s infinite; }",
      ".vg-dot:nth-child(2) { animation-delay: .2s; }",
      ".vg-dot:nth-child(3) { animation-delay: .4s; }",
      "@keyframes vgBounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }",

      /* Input area */
      "#vg-footer { padding: 12px; background: #fff; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; align-items: flex-end; flex-shrink: 0; }",
      "#vg-input { flex: 1; border: 1.5px solid #d1d5db; border-radius: 10px; padding: 9px 12px; font-size: 14px; font-family: inherit; resize: none; outline: none; line-height: 1.4; max-height: 96px; overflow-y: auto; transition: border-color .15s; color: #1f2937; }",
      "#vg-input::placeholder { color: #9ca3af; }",
      "#vg-input:focus { border-color: " + config.primaryColor + "; }",
      "#vg-send-btn { flex-shrink: 0; width: 38px; height: 38px; background: " + config.primaryColor + "; border: none; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: opacity .15s, transform .1s; }",
      "#vg-send-btn:hover:not(:disabled) { opacity: .88; }",
      "#vg-send-btn:active:not(:disabled) { transform: scale(.93); }",
      "#vg-send-btn:disabled { opacity: .45; cursor: not-allowed; }",

      /* FAB bubble */
      "#vg-fab { width: 56px; height: 56px; border-radius: 50%; background: " + config.primaryColor + "; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 20px rgba(0,0,0,.22); transition: transform .15s, box-shadow .15s; position: relative; }",
      "#vg-fab:hover { transform: scale(1.07); box-shadow: 0 6px 28px rgba(0,0,0,.28); }",
      "#vg-fab:active { transform: scale(.95); }",
      "#vg-fab svg { transition: opacity .15s, transform .15s; position: absolute; }",
      "#vg-fab .vg-icon-chat { opacity: 1; transform: scale(1) rotate(0deg); }",
      "#vg-fab .vg-icon-close { opacity: 0; transform: scale(.6) rotate(-90deg); }",
      "#vg-fab.vg-active .vg-icon-chat { opacity: 0; transform: scale(.6) rotate(90deg); }",
      "#vg-fab.vg-active .vg-icon-close { opacity: 1; transform: scale(1) rotate(0deg); }",

      /* Unread badge */
      "#vg-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; background: #ef4444; color: #fff; border-radius: 9px; font-size: 11px; font-weight: 700; display: none; align-items: center; justify-content: center; padding: 0 4px; border: 2px solid #fff; }",

      /* Mobile */
      "@media (max-width: 480px) { #vg-widget { bottom: 0; right: 0; } #vg-window { width: 100vw; height: 100dvh; border-radius: 0; margin-bottom: 0; } #vg-window.vg-open { display: flex; } }",
    ].join("\n");

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── DOM ───────────────────────────────────────────────────────────────────

  function buildWidget() {
    var container = document.createElement("div");
    container.id = "vg-widget";
    container.innerHTML = [
      '<div id="vg-window">',
        '<div id="vg-header">',
          '<div id="vg-avatar">🏠</div>',
          '<div id="vg-header-info">',
            '<div id="vg-header-name">' + config.agentName + '</div>',
            '<div id="vg-header-sub">Van Gestel Kozijnen &amp; Installaties</div>',
          '</div>',
          '<button id="vg-close-btn" aria-label="Sluit chat">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
          '</button>',
        '</div>',
        '<div id="vg-messages"></div>',
        '<div id="vg-footer">',
          '<textarea id="vg-input" rows="1" placeholder="Typ uw bericht..." aria-label="Bericht"></textarea>',
          '<button id="vg-send-btn" aria-label="Verzenden">',
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
          '</button>',
        '</div>',
      '</div>',
      '<button id="vg-fab" aria-label="Open chat">',
        '<svg class="vg-icon-chat" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        '<svg class="vg-icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '<div id="vg-badge"></div>',
      '</button>',
    ].join("");

    document.body.appendChild(container);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function nowTime() {
    return new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  }

  function scrollToBottom() {
    var msgs = document.getElementById("vg-messages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function addMessage(role, text) {
    var msgs = document.getElementById("vg-messages");
    var wrapper = document.createElement("div");
    wrapper.className = "vg-msg " + (role === "agent" ? "vg-agent" : "vg-user");

    var bubble = document.createElement("div");
    bubble.className = "vg-bubble";
    bubble.textContent = text;

    var time = document.createElement("div");
    time.className = "vg-time";
    time.textContent = nowTime();

    wrapper.appendChild(bubble);
    wrapper.appendChild(time);
    msgs.appendChild(wrapper);
    scrollToBottom();
  }

  function showTyping() {
    var msgs = document.getElementById("vg-messages");
    var el = document.createElement("div");
    el.className = "vg-msg vg-agent";
    el.id = "vg-typing-indicator";
    el.innerHTML = '<div class="vg-typing"><div class="vg-dot"></div><div class="vg-dot"></div><div class="vg-dot"></div></div>';
    msgs.appendChild(el);
    scrollToBottom();
  }

  function hideTyping() {
    var el = document.getElementById("vg-typing-indicator");
    if (el) el.remove();
  }

  function setInputEnabled(enabled) {
    var input = document.getElementById("vg-input");
    var btn = document.getElementById("vg-send-btn");
    if (input) input.disabled = !enabled;
    if (btn) btn.disabled = !enabled;
    isLoading = !enabled;
  }

  function showBadge(show) {
    var badge = document.getElementById("vg-badge");
    if (!badge) return;
    badge.style.display = show ? "flex" : "none";
  }

  // ── API ───────────────────────────────────────────────────────────────────

  function sendMessage(text) {
    if (isLoading || !text.trim()) return;

    addMessage("user", text.trim());
    setInputEnabled(false);
    showTyping();

    fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text.trim(), sessionId: sessionId }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        hideTyping();
        if (data.sessionId) {
          sessionId = data.sessionId;
          localStorage.setItem(SESSION_KEY, sessionId);
        }
        var reply = data.reply || "Er is iets misgegaan. Probeer het opnieuw.";
        addMessage("agent", reply);
        if (!isOpen) showBadge(true);
      })
      .catch(function () {
        hideTyping();
        addMessage("agent", "Sorry, er is een verbindingsfout opgetreden. Probeer het later opnieuw.");
      })
      .finally(function () {
        setInputEnabled(true);
        var input = document.getElementById("vg-input");
        if (input) input.focus();
      });
  }

  // ── Toggle ────────────────────────────────────────────────────────────────

  function openChat() {
    isOpen = true;
    var win = document.getElementById("vg-window");
    var fab = document.getElementById("vg-fab");
    if (win) win.classList.add("vg-open");
    if (fab) fab.classList.add("vg-active");
    showBadge(false);
    var input = document.getElementById("vg-input");
    if (input) setTimeout(function () { input.focus(); }, 220);
    scrollToBottom();
  }

  function closeChat() {
    isOpen = false;
    var win = document.getElementById("vg-window");
    var fab = document.getElementById("vg-fab");
    if (win) win.classList.remove("vg-open");
    if (fab) fab.classList.remove("vg-active");
  }

  // ── Events ────────────────────────────────────────────────────────────────

  function bindEvents() {
    document.getElementById("vg-fab").addEventListener("click", function () {
      isOpen ? closeChat() : openChat();
    });

    document.getElementById("vg-close-btn").addEventListener("click", closeChat);

    var input = document.getElementById("vg-input");
    var sendBtn = document.getElementById("vg-send-btn");

    sendBtn.addEventListener("click", function () {
      var val = input.value;
      input.value = "";
      autoResize(input);
      sendMessage(val);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        var val = input.value;
        input.value = "";
        autoResize(input);
        sendMessage(val);
      }
    });

    input.addEventListener("input", function () { autoResize(input); });
  }

  function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();
    buildWidget();
    bindEvents();
    addMessage("agent", config.welcomeMessage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
