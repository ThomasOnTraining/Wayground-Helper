(function () {
    'use strict';

    // ##################################################################
    // #               URL DO SEU WORKER CONFIGURADA                    #
    // ##################################################################
    const PROXY_URL = "https://api-banco.pintoassado390.workers.dev";
    // ##################################################################

    // --- SELETORES GLOBAIS ---
    const ACTIVE_QUESTION_SELECTOR = ".question-text-color";
    const PA_SUBMIT_BUTTON_SELECTOR = 'button[data-cy="submit-button"]';
    const PA_NEXT_BUTTON_SELECTOR = '.right-navigator, .slide-next-button, .next-question-button';

    // --- (PARTE 1: INTERCEPTADOR - Sem alterações) ---
    let gameDataHasBeenProcessed = false;
    const originalFetch = window.fetch;
    Object.defineProperty(window, 'fetch', {
        configurable: true, enumerable: true,
        get() {
            return async (...args) => {
                const response = await originalFetch.apply(this, args);
                const [resource] = args;
                const url = (typeof resource === 'string') ? resource : resource.url;
                if (url.includes('/play-api/')) {
                    try {
                        const responseClone = response.clone();
                        const data = await responseClone.json();
                        if (data?.room?.questions && typeof data.room.questions === 'object' && !Array.isArray(data.room.questions) && !gameDataHasBeenProcessed) {
                            gameDataHasBeenProcessed = true;
                            window.dispatchEvent(new CustomEvent('GameDataIntercepted', { detail: data }));
                        }
                    } catch (e) { }
                    if (url.includes('/playerGameOver') || url.includes('/player-summary')) {
                        window.dispatchEvent(new CustomEvent('GameEnded'));
                    }
                }
                return response;
            };
        }
    });
    const originalXHR_open = XMLHttpRequest.prototype.open; const originalXHR_send = XMLHttpRequest.prototype.send; XMLHttpRequest.prototype.open = function (...e) { return this._requestURL = e[1], originalXHR_open.apply(this, e) }; XMLHttpRequest.prototype.send = function (...e) { return this.addEventListener("load", function () { if (this._requestURL && this._requestURL.includes("/play-api/")) { try { const e = JSON.parse(this.responseText); e?.room?.questions && "object" == typeof e.room.questions && !Array.isArray(e.room.questions) && !gameDataHasBeenProcessed && (gameDataHasBeenProcessed = !0, window.dispatchEvent(new CustomEvent("GameDataIntercepted", { detail: e }))) } catch (e) { } (this._requestURL.includes("/playerGameOver") || this._requestURL.includes("/player-summary")) && window.dispatchEvent(new CustomEvent("GameEnded")) } }), originalXHR_send.apply(this, e) };


    // ======================================================================
    // PARTE 2: SISTEMA DE CONFIGURAÇÕES
    // ======================================================================

    const DEFAULT_CONFIG = {
        theme: 'dark',           // 'dark' ou 'darker'
        autoPilotSpeed: 750,     // ms entre ações do piloto automático
        autoSubmit: true         // auto-enviar após preencher
    };

    function loadConfig() {
        try {
            const saved = localStorage.getItem('tyzziz_config');
            if (saved) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn('Tyzziz: Erro ao carregar configurações:', e);
        }
        return { ...DEFAULT_CONFIG };
    }

    function saveConfig(config) {
        try {
            localStorage.setItem('tyzziz_config', JSON.stringify(config));
        } catch (e) {
            console.warn('Tyzziz: Erro ao salvar configurações:', e);
        }
    }

    let tyzzizConfig = loadConfig();

    // ======================================================================
    // PARTE 3: VARIÁVEIS DE ESTADO DA GUI
    // ======================================================================

    let isGUIReady = false;
    let gameDataForGUI = null;
    let currentActiveQuestionText = "";
    let questionObserver = null;
    let isMasterAutoModeOn = false;
    let masterInterval = null;
    let isAutoTaskRunning = false;
    let currentTab = 'questions'; // 'questions' ou 'settings'

    // ======================================================================
    // PARTE 4: EVENT LISTENERS GLOBAIS
    // ======================================================================

    window.addEventListener('GameDataIntercepted', function (event) {
        gameDataForGUI = event.detail;
        if (isGUIReady) {
            populateGUI(gameDataForGUI.room.questions);
        }
        startQuestionObserver();
    });

    window.addEventListener('GameEnded', handleGameEnd);

    function handleGameEnd() {
        if (isMasterAutoModeOn) {
            console.log("Piloto Automático: Fim de jogo detectado. Desligando... 🚀");
            isMasterAutoModeOn = false;
            if (masterInterval) clearInterval(masterInterval);
            masterInterval = null;
            const autoBtn = document.getElementById('qia-auto-mode-btn');
            if (autoBtn) autoBtn.classList.remove('qia-auto-mode-on');
            startQuestionObserver();
        }
    }

    // ======================================================================
    // PARTE 5: CRIAÇÃO DA GUI - ESTILOS
    // ======================================================================

    function createGUI() {
        isGUIReady = true;

        // Injetar fonte Inter do Google Fonts
        const fontLink = document.createElement('link');
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
        fontLink.rel = 'stylesheet';
        document.head.appendChild(fontLink);

        const styles = `
            /* ========== VARIÁVEIS DE TEMA ========== */
            :root {
                --qia-bg-primary: rgba(30, 30, 35, 0.95);
                --qia-bg-secondary: rgba(40, 40, 48, 0.9);
                --qia-bg-tertiary: rgba(50, 50, 60, 0.85);
                --qia-border: rgba(255, 255, 255, 0.08);
                --qia-border-light: rgba(255, 255, 255, 0.12);
                --qia-text-primary: #ffffff;
                --qia-text-secondary: rgba(255, 255, 255, 0.7);
                --qia-text-muted: rgba(255, 255, 255, 0.5);
                --qia-accent: #6366f1;
                --qia-accent-hover: #818cf8;
                --qia-success: #22c55e;
                --qia-warning: #f59e0b;
                --qia-danger: #ef4444;
                --qia-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
            }
            
            .qia-theme-darker {
                --qia-bg-primary: rgba(15, 15, 18, 0.98);
                --qia-bg-secondary: rgba(22, 22, 28, 0.95);
                --qia-bg-tertiary: rgba(30, 30, 38, 0.9);
                --qia-border: rgba(255, 255, 255, 0.05);
                --qia-border-light: rgba(255, 255, 255, 0.08);
            }
            
            /* ========== PAINEL PRINCIPAL ========== */
            #qia-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 85vh;
                background: var(--qia-bg-primary);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid var(--qia-border);
                border-radius: 16px;
                box-shadow: 
                    0 25px 50px -12px rgba(0, 0, 0, 0.5),
                    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 999999;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                color: var(--qia-text-primary);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                transform-origin: top right;
            }
            
            #qia-panel.qia-minimized {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 
                    0 10px 25px -5px rgba(99, 102, 241, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
            }
            
            #qia-panel.qia-minimized #qia-header,
            #qia-panel.qia-minimized #qia-tabs,
            #qia-panel.qia-minimized #qia-content,
            #qia-panel.qia-minimized #qia-footer {
                display: none;
            }
            
            /* ========== HEADER ========== */
            #qia-header {
                padding: 16px 20px;
                background: var(--qia-gradient);
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
                position: relative;
                overflow: hidden;
            }
            
            #qia-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%);
                animation: qia-shimmer 3s infinite;
            }
            
            @keyframes qia-shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            
            #qia-header-content {
                display: flex;
                align-items: center;
                gap: 10px;
                position: relative;
                z-index: 1;
            }
            
            #qia-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
                color: #ffffff;
                text-shadow: 0 2px 4px rgba(0,0,0,0.2);
                letter-spacing: -0.5px;
            }
            
            #qia-version {
                font-size: 11px;
                padding: 2px 8px;
                background: rgba(255,255,255,0.2);
                border-radius: 20px;
                font-weight: 500;
            }
            
            #qia-controls {
                display: flex;
                align-items: center;
                gap: 4px;
                position: relative;
                z-index: 1;
            }
            
            #qia-controls button {
                background: rgba(255, 255, 255, 0.15);
                border: none;
                cursor: pointer;
                font-size: 16px;
                padding: 8px;
                border-radius: 8px;
                color: #ffffff;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
            }
            
            #qia-controls button:hover {
                background: rgba(255, 255, 255, 0.25);
                transform: scale(1.05);
            }
            
            #qia-controls button.qia-active {
                background: rgba(255, 255, 255, 0.3);
                box-shadow: 0 0 12px rgba(255,255,255,0.3);
            }
            
            /* ========== TABS ========== */
            #qia-tabs {
                display: flex;
                padding: 12px 16px 0;
                gap: 8px;
                background: var(--qia-bg-secondary);
                border-bottom: 1px solid var(--qia-border);
            }
            
            .qia-tab {
                flex: 1;
                padding: 12px 16px;
                background: transparent;
                border: none;
                color: var(--qia-text-secondary);
                font-family: inherit;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                border-radius: 10px 10px 0 0;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            
            .qia-tab:hover {
                color: var(--qia-text-primary);
                background: var(--qia-bg-tertiary);
            }
            
            .qia-tab.qia-tab-active {
                color: var(--qia-text-primary);
                background: var(--qia-bg-primary);
                border: 1px solid var(--qia-border);
                border-bottom: 1px solid var(--qia-bg-primary);
                margin-bottom: -1px;
            }
            
            .qia-tab-icon {
                font-size: 16px;
            }
            
            /* ========== CONTENT ========== */
            #qia-content {
                padding: 16px;
                overflow-y: auto;
                flex-grow: 1;
                background: var(--qia-bg-primary);
            }
            
            #qia-content::-webkit-scrollbar {
                width: 6px;
            }
            
            #qia-content::-webkit-scrollbar-track {
                background: transparent;
            }
            
            #qia-content::-webkit-scrollbar-thumb {
                background: var(--qia-border-light);
                border-radius: 3px;
            }
            
            #qia-content::-webkit-scrollbar-thumb:hover {
                background: var(--qia-text-muted);
            }
            
            /* ========== SETTINGS PANEL ========== */
            #qia-settings-content {
                display: none;
            }
            
            #qia-settings-content.qia-visible {
                display: block;
            }
            
            #qia-questions-content.qia-hidden {
                display: none;
            }
            
            .qia-setting-group {
                margin-bottom: 24px;
            }
            
            .qia-setting-group-title {
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: var(--qia-text-muted);
                margin-bottom: 12px;
            }
            
            .qia-setting-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 14px 16px;
                background: var(--qia-bg-secondary);
                border: 1px solid var(--qia-border);
                border-radius: 12px;
                margin-bottom: 8px;
            }
            
            .qia-setting-label {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .qia-setting-name {
                font-size: 14px;
                font-weight: 500;
                color: var(--qia-text-primary);
            }
            
            .qia-setting-desc {
                font-size: 12px;
                color: var(--qia-text-muted);
            }
            
            /* Toggle Switch */
            .qia-toggle {
                position: relative;
                width: 44px;
                height: 24px;
            }
            
            .qia-toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .qia-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--qia-bg-tertiary);
                border: 1px solid var(--qia-border);
                transition: 0.2s;
                border-radius: 24px;
            }
            
            .qia-toggle-slider::before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 2px;
                bottom: 2px;
                background: var(--qia-text-secondary);
                transition: 0.2s;
                border-radius: 50%;
            }
            
            .qia-toggle input:checked + .qia-toggle-slider {
                background: var(--qia-accent);
                border-color: var(--qia-accent);
            }
            
            .qia-toggle input:checked + .qia-toggle-slider::before {
                transform: translateX(20px);
                background: #ffffff;
            }
            
            /* Range Slider */
            .qia-range-container {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .qia-range {
                -webkit-appearance: none;
                width: 120px;
                height: 6px;
                background: var(--qia-bg-tertiary);
                border-radius: 3px;
                outline: none;
            }
            
            .qia-range::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 18px;
                height: 18px;
                background: var(--qia-accent);
                border-radius: 50%;
                cursor: pointer;
                transition: 0.2s;
            }
            
            .qia-range::-webkit-slider-thumb:hover {
                transform: scale(1.1);
                background: var(--qia-accent-hover);
            }
            
            .qia-range-value {
                font-size: 13px;
                font-weight: 600;
                color: var(--qia-accent);
                min-width: 50px;
                text-align: right;
            }
            
            /* Theme Selector */
            .qia-theme-selector {
                display: flex;
                gap: 8px;
            }
            
            .qia-theme-option {
                padding: 8px 16px;
                background: var(--qia-bg-tertiary);
                border: 2px solid var(--qia-border);
                border-radius: 8px;
                color: var(--qia-text-secondary);
                font-family: inherit;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .qia-theme-option:hover {
                border-color: var(--qia-accent);
                color: var(--qia-text-primary);
            }
            
            .qia-theme-option.qia-selected {
                background: var(--qia-accent);
                border-color: var(--qia-accent);
                color: #ffffff;
            }
            
            /* ========== QUESTIONS CONTENT ========== */
            .qia-status-message {
                text-align: center;
                padding: 40px 20px;
                color: var(--qia-text-secondary);
            }
            
            .qia-status-icon {
                font-size: 48px;
                margin-bottom: 16px;
                display: block;
            }
            
            .qia-status-text {
                font-size: 14px;
                line-height: 1.5;
            }
            
            .qia-question-item {
                margin-bottom: 12px;
                padding: 16px;
                background: var(--qia-bg-secondary);
                border: 1px solid var(--qia-border);
                border-radius: 12px;
                transition: all 0.2s ease;
            }
            
            .qia-question-item:hover {
                border-color: var(--qia-border-light);
            }
            
            .qia-question-item.qia-focused {
                border-color: var(--qia-accent);
                background: rgba(99, 102, 241, 0.1);
                box-shadow: 0 0 20px rgba(99, 102, 241, 0.15);
            }
            
            .qia-question-item p {
                margin: 6px 0;
                color: var(--qia-text-primary);
                line-height: 1.5;
            }
            
            .qia-question-text {
                font-weight: 600;
                font-size: 14px;
            }
            
            .qia-question-type {
                display: inline-block;
                padding: 3px 8px;
                background: var(--qia-bg-tertiary);
                border-radius: 6px;
                font-size: 11px;
                font-weight: 500;
                color: var(--qia-text-muted);
                margin-left: 8px;
            }
            
            .qia-options-list {
                list-style: none;
                padding: 12px 0 0 0;
                margin: 0;
                font-size: 13px;
                color: var(--qia-text-secondary);
            }
            
            .qia-options-list li {
                padding: 6px 12px;
                margin: 4px 0;
                background: var(--qia-bg-tertiary);
                border-radius: 6px;
            }
            
            .qia-options-list b {
                font-weight: 600;
                color: var(--qia-text-primary);
            }
            
            .qia-ai-button {
                cursor: pointer;
                padding: 10px 16px;
                background: var(--qia-bg-tertiary);
                border: 1px solid var(--qia-border);
                border-radius: 8px;
                color: var(--qia-text-primary);
                font-family: inherit;
                font-size: 13px;
                font-weight: 500;
                margin-top: 12px;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            
            .qia-ai-button:hover {
                background: var(--qia-accent);
                border-color: var(--qia-accent);
            }
            
            .qia-ai-button:disabled {
                cursor: not-allowed;
                opacity: 0.5;
            }
            
            .qia-ai-button.qia-loading {
                position: relative;
                color: transparent;
            }
            
            .qia-ai-button.qia-loading::after {
                content: '';
                position: absolute;
                width: 16px;
                height: 16px;
                border: 2px solid var(--qia-text-muted);
                border-top-color: var(--qia-accent);
                border-radius: 50%;
                animation: qia-spin 0.8s linear infinite;
            }
            
            @keyframes qia-spin {
                to { transform: rotate(360deg); }
            }
            
            .qia-ai-response {
                margin-top: 12px;
                padding: 12px 16px;
                border-left: 3px solid var(--qia-accent);
                background: rgba(99, 102, 241, 0.1);
                border-radius: 0 8px 8px 0;
                font-size: 13px;
                white-space: pre-wrap;
                font-weight: 500;
                color: var(--qia-text-primary);
                line-height: 1.6;
            }
            
            .qia-autoclick-button {
                cursor: pointer;
                padding: 10px 16px;
                background: var(--qia-success);
                border: none;
                border-radius: 8px;
                color: white;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                margin-top: 10px;
                margin-left: 8px;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            
            .qia-autoclick-button:hover {
                filter: brightness(1.1);
                transform: translateY(-1px);
            }
            
            .qia-autoclick-button:disabled {
                background: var(--qia-text-muted);
                cursor: not-allowed;
                transform: none;
            }
            
            /* ========== FOOTER ========== */
            #qia-footer {
                padding: 12px 16px;
                background: var(--qia-bg-secondary);
                border-top: 1px solid var(--qia-border);
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            }
            
            .qia-footer-status {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: var(--qia-text-muted);
            }
            
            .qia-status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--qia-text-muted);
            }
            
            .qia-status-dot.qia-active {
                background: var(--qia-success);
                box-shadow: 0 0 8px var(--qia-success);
                animation: qia-pulse 2s infinite;
            }
            
            @keyframes qia-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .qia-footer-actions {
                display: flex;
                gap: 8px;
            }
            
            .qia-footer-btn {
                padding: 8px 12px;
                background: var(--qia-bg-tertiary);
                border: 1px solid var(--qia-border);
                border-radius: 8px;
                color: var(--qia-text-secondary);
                font-family: inherit;
                font-size: 12px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .qia-footer-btn:hover {
                background: var(--qia-bg-primary);
                color: var(--qia-text-primary);
                border-color: var(--qia-border-light);
            }
            
            .qia-footer-btn.qia-primary {
                background: var(--qia-accent);
                border-color: var(--qia-accent);
                color: #ffffff;
            }
            
            .qia-footer-btn.qia-primary:hover {
                background: var(--qia-accent-hover);
            }
            
            .qia-footer-btn.qia-active {
                background: var(--qia-success);
                border-color: var(--qia-success);
                color: #ffffff;
            }
            
            /* ========== MINIMIZED STATE ========== */
            #qia-restore-btn-circle {
                display: none;
                width: 100%;
                height: 100%;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                cursor: pointer;
                user-select: none;
                background: var(--qia-gradient);
                border-radius: 50%;
            }
            
            #qia-panel.qia-minimized #qia-restore-btn-circle {
                display: flex;
            }
        `;

        const styleSheet = document.createElement("style");
        styleSheet.id = 'qia-styles';
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);

        // ========== ESTRUTURA HTML DO PAINEL ==========
        const panelHTML = `
            <div id="qia-header">
                <div id="qia-header-content">
                    <h3>🧠 Tyzziz</h3>
                    <span id="qia-version">v3.0</span>
                </div>
                <div id="qia-controls">
                    <button id="qia-focus-toggle-btn" title="Modo Foco (mostra só questão atual)">🎯</button>
                    <button id="qia-minimize-btn" title="Minimizar">✕</button>
                </div>
            </div>
            
            <div id="qia-tabs">
                <button class="qia-tab qia-tab-active" data-tab="questions">
                    <span class="qia-tab-icon">📝</span>
                    Questões
                </button>
                <button class="qia-tab" data-tab="settings">
                    <span class="qia-tab-icon">⚙️</span>
                    Configurações
                </button>
            </div>
            
            <div id="qia-content">
                <div id="qia-questions-content">
                    <div class="qia-status-message">
                        <span class="qia-status-icon">⏳</span>
                        <p class="qia-status-text">Aguardando o início do jogo...</p>
                    </div>
                </div>
                
                <div id="qia-settings-content">
                    <div class="qia-setting-group">
                        <div class="qia-setting-group-title">Aparência</div>
                        <div class="qia-setting-item">
                            <div class="qia-setting-label">
                                <span class="qia-setting-name">Tema</span>
                                <span class="qia-setting-desc">Escolha o estilo visual do painel</span>
                            </div>
                            <div class="qia-theme-selector">
                                <button class="qia-theme-option ${tyzzizConfig.theme === 'dark' ? 'qia-selected' : ''}" data-theme="dark">🌙 Dark</button>
                                <button class="qia-theme-option ${tyzzizConfig.theme === 'darker' ? 'qia-selected' : ''}" data-theme="darker">🌑 Darker</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="qia-setting-group">
                        <div class="qia-setting-group-title">Piloto Automático</div>
                        <div class="qia-setting-item">
                            <div class="qia-setting-label">
                                <span class="qia-setting-name">Velocidade</span>
                                <span class="qia-setting-desc">Intervalo entre ações automáticas</span>
                            </div>
                            <div class="qia-range-container">
                                <input type="range" class="qia-range" id="qia-speed-slider" 
                                    min="500" max="2000" step="50" value="${tyzzizConfig.autoPilotSpeed}">
                                <span class="qia-range-value" id="qia-speed-value">${tyzzizConfig.autoPilotSpeed}ms</span>
                            </div>
                        </div>
                        <div class="qia-setting-item">
                            <div class="qia-setting-label">
                                <span class="qia-setting-name">Auto-Enviar</span>
                                <span class="qia-setting-desc">Clicar em enviar automaticamente</span>
                            </div>
                            <label class="qia-toggle">
                                <input type="checkbox" id="qia-autosubmit-toggle" ${tyzzizConfig.autoSubmit ? 'checked' : ''}>
                                <span class="qia-toggle-slider"></span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="qia-setting-group">
                        <div class="qia-setting-group-title">Sobre</div>
                        <div class="qia-setting-item" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                            <span class="qia-setting-name">Tyzziz v3.0</span>
                            <span class="qia-setting-desc">Assistente de questões com IA. Use com responsabilidade.</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div id="qia-footer">
                <div class="qia-footer-status">
                    <span class="qia-status-dot" id="qia-status-indicator"></span>
                    <span id="qia-status-text">Aguardando...</span>
                </div>
                <div class="qia-footer-actions">
                    <button class="qia-footer-btn" id="qia-reload-btn" title="Resetar para novo jogo">
                        🔄 Reset
                    </button>
                    <button class="qia-footer-btn qia-primary" id="qia-auto-mode-btn" title="Piloto Automático">
                        🚀 Auto
                    </button>
                </div>
            </div>
            
            <div id="qia-restore-btn-circle">🧠</div>
        `;

        const panel = document.createElement("div");
        panel.id = "qia-panel";
        if (tyzzizConfig.theme === 'darker') {
            panel.classList.add('qia-theme-darker');
        }
        panel.innerHTML = panelHTML;
        document.body.appendChild(panel);

        // ========== REFERÊNCIAS E EVENT LISTENERS ==========
        const qiaPanel = document.getElementById('qia-panel');
        const header = document.getElementById('qia-header');
        const restoreBtn = document.getElementById('qia-restore-btn-circle');

        // Drag functionality
        let isDragging = false;
        let wasDragging = false;
        let offset = { x: 0, y: 0 };

        const dragStart = (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            wasDragging = false;
            offset.x = e.clientX - qiaPanel.offsetLeft;
            offset.y = e.clientY - qiaPanel.offsetTop;
        };

        header.addEventListener('mousedown', dragStart);
        restoreBtn.addEventListener('mousedown', dragStart);

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                wasDragging = true;
                qiaPanel.style.left = `${e.clientX - offset.x}px`;
                qiaPanel.style.top = `${e.clientY - offset.y}px`;
                qiaPanel.style.right = 'auto';
            }
        });

        document.addEventListener('mouseup', () => { isDragging = false; });

        // Minimize/Restore
        document.getElementById('qia-minimize-btn').addEventListener('click', () => {
            qiaPanel.classList.add('qia-minimized');
        });

        restoreBtn.addEventListener('click', () => {
            if (!wasDragging) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const fullPanelWidth = 400;
                const minPanelHeight = 100;
                const padding = 20;
                let rect = qiaPanel.getBoundingClientRect();

                if (rect.left + fullPanelWidth + padding > vw) {
                    qiaPanel.style.left = (vw - fullPanelWidth - padding) + 'px';
                }
                if (rect.left < padding) {
                    qiaPanel.style.left = padding + 'px';
                }
                if (rect.top < padding) {
                    qiaPanel.style.top = padding + 'px';
                }
                if (rect.top + minPanelHeight + padding > vh) {
                    qiaPanel.style.top = (vh - minPanelHeight - padding) + 'px';
                }

                qiaPanel.classList.remove('qia-minimized');
            }
            wasDragging = false;
        });

        // Tab switching
        document.querySelectorAll('.qia-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.qia-tab').forEach(t => t.classList.remove('qia-tab-active'));
                tab.classList.add('qia-tab-active');

                const tabName = tab.dataset.tab;
                currentTab = tabName;

                if (tabName === 'settings') {
                    document.getElementById('qia-questions-content').classList.add('qia-hidden');
                    document.getElementById('qia-settings-content').classList.add('qia-visible');
                } else {
                    document.getElementById('qia-questions-content').classList.remove('qia-hidden');
                    document.getElementById('qia-settings-content').classList.remove('qia-visible');
                }
            });
        });

        // Focus mode toggle (now a button instead of checkbox)
        let isFocusMode = false;
        document.getElementById('qia-focus-toggle-btn').addEventListener('click', (e) => {
            isFocusMode = !isFocusMode;
            e.target.classList.toggle('qia-active', isFocusMode);

            if (isFocusMode) {
                if (!isMasterAutoModeOn) startQuestionObserver();
                applyFocus(currentActiveQuestionText);
            } else {
                if (!isMasterAutoModeOn) startQuestionObserver();
                removeFocus();
            }
        });

        // Compatibility: create hidden checkbox for existing code that checks it
        const hiddenFocusCheckbox = document.createElement('input');
        hiddenFocusCheckbox.type = 'checkbox';
        hiddenFocusCheckbox.id = 'qia-focus-toggle';
        hiddenFocusCheckbox.style.display = 'none';
        panel.appendChild(hiddenFocusCheckbox);

        // Sync hidden checkbox with button state
        document.getElementById('qia-focus-toggle-btn').addEventListener('click', () => {
            hiddenFocusCheckbox.checked = isFocusMode;
        });

        // Reload button
        document.getElementById('qia-reload-btn').addEventListener('click', () => {
            console.log("Tyzziz: Resetando para o próximo jogo...");
            gameDataHasBeenProcessed = false;
            gameDataForGUI = null;
            currentActiveQuestionText = "";

            if (masterInterval) clearInterval(masterInterval);
            masterInterval = null;
            isMasterAutoModeOn = false;

            const autoBtn = document.getElementById('qia-auto-mode-btn');
            if (autoBtn) autoBtn.classList.remove('qia-active');

            if (questionObserver) questionObserver.disconnect();
            startQuestionObserver();

            const questionsContent = document.getElementById('qia-questions-content');
            if (questionsContent) {
                questionsContent.innerHTML = `
                    <div class="qia-status-message">
                        <span class="qia-status-icon">⏳</span>
                        <p class="qia-status-text">Aguardando o início do jogo...</p>
                    </div>
                `;
            }

            isFocusMode = false;
            document.getElementById('qia-focus-toggle-btn').classList.remove('qia-active');
            hiddenFocusCheckbox.checked = false;
            removeFocus();

            updateStatusIndicator(false, 'Aguardando...');
        });

        // Auto mode button
        document.getElementById('qia-auto-mode-btn').addEventListener('click', (e) => {
            isMasterAutoModeOn = !isMasterAutoModeOn;
            e.target.classList.toggle('qia-active', isMasterAutoModeOn);

            if (isMasterAutoModeOn) {
                console.log("Piloto Automático: LIGADO");
                e.target.innerHTML = '🚀 Auto: ON';
                if (questionObserver) questionObserver.disconnect();
                startMasterLoop();
                updateStatusIndicator(true, 'Auto-piloto ativo');
            } else {
                console.log("Piloto Automático: DESLIGADO");
                e.target.innerHTML = '🚀 Auto';
                if (masterInterval) clearInterval(masterInterval);
                startQuestionObserver();
                updateStatusIndicator(false, 'Pronto');
            }
        });

        // Settings: Theme selector
        document.querySelectorAll('.qia-theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.qia-theme-option').forEach(b => b.classList.remove('qia-selected'));
                btn.classList.add('qia-selected');

                const theme = btn.dataset.theme;
                tyzzizConfig.theme = theme;
                saveConfig(tyzzizConfig);

                if (theme === 'darker') {
                    qiaPanel.classList.add('qia-theme-darker');
                } else {
                    qiaPanel.classList.remove('qia-theme-darker');
                }
            });
        });

        // Settings: Speed slider
        const speedSlider = document.getElementById('qia-speed-slider');
        const speedValue = document.getElementById('qia-speed-value');

        speedSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            speedValue.textContent = value + 'ms';
            tyzzizConfig.autoPilotSpeed = value;
            saveConfig(tyzzizConfig);

            // Restart master loop if active to apply new speed
            if (isMasterAutoModeOn) {
                if (masterInterval) clearInterval(masterInterval);
                startMasterLoop();
            }
        });

        // Settings: Auto-submit toggle
        document.getElementById('qia-autosubmit-toggle').addEventListener('change', (e) => {
            tyzzizConfig.autoSubmit = e.target.checked;
            saveConfig(tyzzizConfig);
        });

        // Populate GUI if data already available
        if (gameDataForGUI) {
            populateGUI(gameDataForGUI.room.questions);
        }
    }

    // ========== HELPER: Update Status Indicator ==========
    function updateStatusIndicator(isActive, text) {
        const dot = document.getElementById('qia-status-indicator');
        const statusText = document.getElementById('qia-status-text');

        if (dot) {
            if (isActive) {
                dot.classList.add('qia-active');
            } else {
                dot.classList.remove('qia-active');
            }
        }

        if (statusText) {
            statusText.textContent = text;
        }
    }

    // ========== INICIALIZAÇÃO ==========
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', createGUI);
    } else {
        createGUI();
    }

    // --- (PARTE 3.1: POPULATE GUI - Adicionando 'OPEN') ---
    function populateGUI(questions) {
        const contentDiv = document.getElementById('qia-questions-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '<div class="qia-status-message" style="padding: 16px 0;"><span class="qia-status-icon" style="font-size: 32px;">✅</span><p class="qia-status-text" style="font-weight: 600; margin-top: 8px;">Jogo detectado! Pronto para resolver.</p></div>';
        updateStatusIndicator(false, 'Jogo detectado');
        for (const qId in questions) {
            const questionInfo = questions[qId];
            const questionText = getTextFromHTML(questionInfo.structure?.query?.text);
            const questionKind = questionInfo.structure.kind;
            const imageUrl = questionInfo.structure?.query?.media?.[0]?.url || '';
            const itemDiv = document.createElement('div');
            itemDiv.className = 'qia-question-item';
            itemDiv.dataset.questionText = cleanElementText(questionText.replace(/<blank.*?>/g, ' '));
            let questionHTML = ``;
            let buttonHTML = '';
            const commonButtonData = `data-question="${encodeURIComponent(questionText)}" data-image-url="${imageUrl}"`;
            switch (questionKind) {
                case 'MCQ': case 'MSQ':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const mcqOptions = questionInfo.structure.options.map((opt, i) => ({ text: getTextFromHTML(opt.text), index: String.fromCharCode(65 + i) }));
                    questionHTML += `<ul class="qia-options-list">${mcqOptions.map(opt => `<li>${opt.index}) ${opt.text}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="${questionKind}" ${commonButtonData} data-options="${encodeURIComponent(JSON.stringify(mcqOptions.map(o => `${o.index}) ${o.text}`)))}">Resolver com IA 🤖</button>`;
                    break;
                case 'MATCH':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const matchItems = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    const matchPrompts = questionInfo.structure.matches.map(p => getTextFromHTML(p.text));
                    questionHTML += `<ul class="qia-options-list"><b>Itens:</b>${matchItems.map(p => `<li>${p}</li>`).join('')}</ul>`;
                    questionHTML += `<ul class="qia-options-list"><b>Combinações:</b>${matchPrompts.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="MATCH" ${commonButtonData} data-items="${encodeURIComponent(JSON.stringify(matchItems))}" data-matches="${encodeURIComponent(JSON.stringify(matchPrompts))}">Resolver com IA 🤖</button>`;
                    break;
                case 'CLASSIFICATION':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const classOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    const classTargets = questionInfo.structure.targets.map(t => t.name);
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${classOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    questionHTML += `<ul class="qia-options-list"><b>Categorias:</b>${classTargets.map(t => `<li>${t}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="CLASSIFICATION" ${commonButtonData} data-options="${encodeURIComponent(JSON.stringify(classOptions))}" data-targets="${encodeURIComponent(JSON.stringify(classTargets))}">Resolver com IA 🤖</button>`;
                    break;
                case 'DROPDOWN':
                    const dropdownQuestionText = getTextFromHTML(questionInfo.structure.query.text.replace(/<blank.*?>/g, ' [___] '));
                    const dropdownOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML = `<p class="qia-question-text">${dropdownQuestionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${dropdownOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="DROPDOWN" ${commonButtonData} data-question="${encodeURIComponent(questionInfo.structure.query.text)}" data-options="${encodeURIComponent(JSON.stringify(dropdownOptions))}">Resolver com IA 🤖</button>`;
                    break;
                case 'DRAGNDROP':
                    const dragndropQuestionText = getTextFromHTML(questionInfo.structure.query.text.replace(/<blank.*?>/g, ' [___] '));
                    const dragndropOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML = `<p class="qia-question-text">${dragndropQuestionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${dragndropOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="DRAGNDROP" ${commonButtonData} data-question="${encodeURIComponent(questionInfo.structure.query.text)}" data-options="${encodeURIComponent(JSON.stringify(dragndropOptions))}">Resolver com IA 🤖</button>`;
                    break;
                case 'REORDER':
                    const reorderOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML += `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Para Ordenar:</b>${reorderOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="REORDER" ${commonButtonData} data-options="${encodeURIComponent(JSON.stringify(reorderOptions))}">Resolver com IA 🤖</button>`;
                    break;
                case 'BLANK':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="BLANK" ${commonButtonData}>Resolver com IA 🤖</button>`;
                    break;

                case 'OPEN':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="OPEN" ${commonButtonData}>Resolver com IA 🤖</button>`;
                    break;

                case 'DND_IMAGE':
                    const dndImgOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    const dndImgTargets = questionInfo.structure.targets.map((t, i) => ({ id: t.id, index: i, position: t.position }));
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Opções para arrastar:</b>${dndImgOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    questionHTML += `<p style="font-size: 12px; color: var(--qia-text-muted); margin-top: 8px;">📍 ${dndImgTargets.length} alvos na imagem</p>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="DND_IMAGE" ${commonButtonData} data-options="${encodeURIComponent(JSON.stringify(dndImgOptions))}" data-targets="${encodeURIComponent(JSON.stringify(dndImgTargets))}">Resolver com IA 🤖</button>`;
                    break;

                default: continue;
            }
            itemDiv.innerHTML = `${questionHTML}${buttonHTML}<div class="qia-ai-response" style="display:none;"></div>`;
            contentDiv.appendChild(itemDiv);
        }
        contentDiv.querySelectorAll('.qia-ai-button').forEach(button => { button.addEventListener('click', handleSolveClick); });
    }

    // --- (PARTE 3.2: LÓGICA DA IA - Prompts Modificados) ---

    // --- FUNÇÃO DE CAPTURA DE FRAME PARA GIFS ---
    function captureImageAsBase64(imageUrl) {
        if (!imageUrl) return null;
        let imageElement = document.querySelector(`img[src="${imageUrl}"]`);
        if (!imageElement || imageElement.naturalWidth === 0) {
            const urlWithoutParams = imageUrl.split('?')[0];
            imageElement = document.querySelector(`.media-container img[src*="${urlWithoutParams}"], .img-responsive[src*="${urlWithoutParams}"]`);
            if (!imageElement || imageElement.naturalWidth === 0) {
                console.warn("Elemento de imagem não encontrado ou não carregado para o URL: " + imageUrl);
                return null;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = imageElement.naturalWidth || imageElement.offsetWidth;
        canvas.height = imageElement.naturalHeight || imageElement.offsetHeight;

        if (canvas.width === 0 || canvas.height === 0) {
            console.warn("Canvas com dimensões zero, não é possível capturar.");
            return null;
        }

        const ctx = canvas.getContext('2d');
        try {
            ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error("Erro ao desenhar imagem no canvas:", e);
            return null;
        }
        return canvas.toDataURL('image/png');
    }
    // --- FIM FUNÇÃO DE CAPTURA ---


    function handleSolveClick(event) {
        const button = event.target;
        const responseDiv = button.nextElementSibling;
        const oldAutoClickBtn = button.parentElement.querySelector('.qia-autoclick-button');
        if (oldAutoClickBtn) oldAutoClickBtn.remove();
        button.dataset.processed = "true";
        button.disabled = true;
        const dataset = button.dataset;

        let prompt = buildPrompt(dataset);

        // --- TRATAMENTO DE GIF/IMAGEM (Captura de Frame) ---
        if (dataset.imageUrl && dataset.imageUrl.toLowerCase().endsWith('.gif')) {
            button.textContent = "Capturando GIF...";
            responseDiv.style.display = 'block';
            responseDiv.textContent = 'Extraindo frame estático do GIF...';

            const base64Image = captureImageAsBase64(dataset.imageUrl);

            if (base64Image) {
                dataset.imageBase64 = base64Image;
                delete dataset.imageUrl;

                prompt = `--- MODO DE FALLBACK (Captura de GIF) ---\nPor favor, resolva a questão abaixo usando a imagem em anexo (um frame estático do GIF original). A imagem anexa é um screenshot da pergunta/opções.\n\n${prompt}`;

                button.textContent = "Analisando Frame...";
                responseDiv.textContent = 'Analisando imagem estática...';
            } else {
                button.textContent = "Falha no GIF. Analisando só texto...";
                responseDiv.textContent = 'Falha ao capturar GIF. Analisando apenas texto...';
            }
        }
        // --- FIM TRATAMENTO ---

        else if (dataset.imageUrl) {
            button.textContent = "Lendo imagem...";
            responseDiv.style.display = 'block';
            responseDiv.textContent = 'Analisando imagem...';
        } else {
            button.textContent = "Pensando...";
            responseDiv.style.display = 'block';
            responseDiv.textContent = 'Analisando...';
        }

        performProxyRequest(prompt, responseDiv, button, dataset);
    }

    function buildPrompt(dataset) {
        const { kind, question } = dataset;
        let prompt = '';
        switch (kind) {
            case 'MCQ':
                const mcqOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de MÚLTIPLA ESCOLHA (MCQ). Se uma imagem for fornecida (como contexto), use-a como fonte principal. Esta pergunta tem APENAS UMA resposta correta. Responda APENAS com a letra e o texto completo dessa alternativa. NÃO inclua nenhuma outra opção, introdução, observação ou texto explicativo.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n${mcqOptions.join('\n')}`;
                break;
            case 'MSQ':
                const msqOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de MÚLTIPLA SELEÇÃO (MSQ). Se uma imagem for fornecida (como contexto), use-a como fonte principal. Esta pergunta pode ter UMA OU MAIS respostas corretas. Responda APENAS com a letra e o texto completo de cada alternativa correta, uma por linha.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n${msqOptions.join('\n')}`;
                break;
            case 'MATCH':
                const items = JSON.parse(decodeURIComponent(dataset.items));
                const matches = JSON.parse(decodeURIComponent(dataset.matches));
                prompt = `Analise a seguinte pergunta de combinação. Se uma imagem for fornecida (como contexto), use-a como fonte principal. Sua tarefa é combinar cada item da primeira lista com sua opção correta da segunda lista. Responda APENAS com a lista de pares, um por linha, no formato: "Item -> Combinação Correta".\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nItens:\n- ${items.join('\n- ')}\n\nCombinações:\n- ${matches.join('\n- ')}`;
                break;
            case 'CLASSIFICATION':
                const classOptions = JSON.parse(decodeURIComponent(dataset.options));
                const targets = JSON.parse(decodeURIComponent(dataset.targets));
                prompt = `Analise a seguinte pergunta de classificação. Se uma imagem for fornecida (como contexto), use-a como fonte principal. Sua tarefa é atribuir cada "Opção" à sua "Categoria" correta. Responda APENAS com as categorias e suas opções, um item por linha, começando com "- ". Exemplo de formato:\nCategoria 1:\n- Opção A\n\nCategoria 2:\n- Opção B\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n- ${classOptions.join('\n- ')}\n\nCategorias:\n- ${targets.join('\n- ')}`;
                break;
            case 'DROPDOWN':
            case 'DRAGNDROP':
                const ddQuestion = decodeURIComponent(dataset.question);
                const ddOptionsAI = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta com lacunas para preencher. Se uma imagem for fornecida (como contexto), use-a como fonte principal. O texto da pergunta contém tags como <blank id=...></blank>. Sua tarefa é determinar qual opção da lista de "Opções" se encaixa em cada lacuna. Responda APENAS com uma lista numerada. Formato: "1: [Opção Correta]", "2: [Opção Correta]", etc.\n\nPergunta:\n"${ddQuestion}"\n\nOpções Disponíveis:\n- ${ddOptionsAI.join('\n- ')}`;
                break;
            case 'REORDER':
                const reorderOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de ordenação. Se uma imagem for fornecida (como contexto), use-a como fonte principal. Sua tarefa é colocar a lista de "Itens para Ordenar" na sequência correta. Responda APENAS com uma lista numerada, começando em 1, na ordem correta.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nItens para Ordenar:\n- ${reorderOptions.join('\n- ')}`;
                break;

            case 'BLANK':
                prompt = `Analise a seguinte pergunta de PREENCHER A LACUNA (BLANK). Se uma imagem for fornecida, use-a como fonte principal. Sua tarefa é fornecer a resposta mais curta e direta possível. Responda APENAS com o texto ou número que deve ser preenchido, usando NO MÁXIMO 5 PALAVRAS. NÃO inclua pontuação extra.\n\nPergunta:\n"${decodeURIComponent(question)}"`;
                break;

            case 'OPEN':
                prompt = `Responda a seguinte pergunta de forma resumida, direta e com tom natural, como se fosse um colega. Crie uma resposta concisa, de 1 a 3 frases. IMPORTANTE: Use apenas pontuação padrão (vírgulas, pontos finais). NÃO use hífens, travessões (—) ou barras para listar ou separar ideias. Responda APENAS com o texto da resposta.\n\nPergunta:\n"${decodeURIComponent(question)}"`;
                break;

            case 'DND_IMAGE':
                const dndImgOpts = JSON.parse(decodeURIComponent(dataset.options));
                const dndImgTgts = JSON.parse(decodeURIComponent(dataset.targets));
                const targetsInfo = dndImgTgts.map((t, i) => `Alvo ${i + 1}: posição X=${Math.round(t.position.x)}, Y=${Math.round(t.position.y)}`).join('\n');
                prompt = `Analise a seguinte pergunta de ARRASTAR E SOLTAR COM IMAGEM (DND_IMAGE). 

CONTEXTO: A imagem fornecida mostra uma figura com áreas marcadas onde as opções devem ser soltas. Cada alvo tem coordenadas X/Y na imagem (X aumenta para direita, Y aumenta para baixo).

SUA TAREFA: Analise a IMAGEM visualmente e determine qual opção de texto corresponde a cada área/alvo baseado no conteúdo visual da imagem e no contexto da pergunta.

Responda APENAS com uma lista no formato:
1: [Texto exato da Opção que vai no Alvo 1]
2: [Texto exato da Opção que vai no Alvo 2]
etc.

Pergunta:
"${decodeURIComponent(question)}"

Opções Disponíveis:
${dndImgOpts.map((opt, i) => `- ${opt}`).join('\n')}

Alvos na imagem (coordenadas):
${targetsInfo}`;
                break;
        }
        return prompt;
    }

    // ##################################################################
    // #                     FUNÇÃO MODIFICADA                          #
    // #               MUDANÇA DE MODELO AQUI                           #
    // ##################################################################
    async function performProxyRequest(prompt, responseDiv, button, dataset) {

        // Modelo definido como GPT-OSS-120B e inclusão do imageBase64 para GIFs
        const payload = {
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            imageUrl: dataset.imageUrl || null,
            imageBase64: dataset.imageBase64 || null
        };

        try {
            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                const mockErrorResponse = { status: response.status, responseText: errorText };

                responseDiv.textContent = handleProxyError(mockErrorResponse);
                button.disabled = false;
                button.textContent = "Resolver com IA 🤖";
                button.dataset.processed = "false";
                return;
            }

            const responseText = await response.text();
            handleAISuccess(responseText, responseDiv, button, dataset);

        } catch (error) {
            responseDiv.textContent = 'Erro de rede (CORS?). Não foi possível conectar ao proxy.';
            button.disabled = false;
            button.textContent = "Resolver com IA 🤖";
            button.dataset.processed = "false";
            console.error("Erro na requisição para o Proxy:", error);
        }
    }
    // ##################################################################
    // #                     FIM DA MODIFICAÇÃO                       #
    // ##################################################################


    function handleProxyError(response, prefix = "Erro do Proxy:") {
        try {
            const errorData = JSON.parse(response.responseText);
            let errorMessage = errorData?.error || 'Erro desconhecido';
            if (typeof errorMessage === 'object') {
                errorMessage = errorMessage.message || JSON.stringify(errorMessage);
            }
            return `${prefix} ${errorMessage}`;
        } catch (e) {
            return `Erro: ${response.status}. Proxy respondeu mal: ${response.responseText.substring(0, 100)}...`;
        }
    }

    // --- NOVO: Função de Auto-Digitar e Enviar para Questões Abertas ---
    async function handleOpenTypeClick(aiResponseText, button) {
        button.disabled = true;
        button.textContent = 'Digitando...';

        // 1. Encontrar o textarea pelo atributo data-cy
        const textarea = document.querySelector('textarea[data-cy="open-ended-textarea"]');

        if (!textarea) {
            console.error("[OPEN] Textarea de resposta não encontrada.");
            button.textContent = 'Erro (Textarea)!';
            button.style.backgroundColor = '#dc3545';
            return;
        }

        // 2. Digitar a resposta
        textarea.value = aiResponseText;

        // Simular evento de input para que a aplicação reconheça a mudança de valor
        try {
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.warn("[OPEN] Falha ao simular evento de input, mas o texto foi inserido.", e);
        }

        // Pequena pausa para garantir que a aplicação processe o input
        await new Promise(resolve => setTimeout(resolve, 500));

        // 3. Clicar em Enviar (Submit)
        const submitBtn = document.querySelector(PA_SUBMIT_BUTTON_SELECTOR);

        if (submitBtn && !submitBtn.disabled) {
            console.log("[OPEN] Texto inserido. Clicando em 'Enviar'...");
            submitBtn.click();
            button.textContent = 'Enviado!';
            button.style.backgroundColor = '#28a745';

            // Pequena pausa para a submissão
            await new Promise(r => setTimeout(r, 1200));
        } else {
            button.textContent = 'Texto Inserido!';
            button.style.backgroundColor = '#ffc107';
            console.warn("[OPEN] Texto inserido, mas botão de Enviar não encontrado ou desabilitado.");
        }
    }
    // --- FIM handleOpenTypeClick ---

    // --- NOVO: Função de Auto-Digitar e Enviar para Questões BLANK ---
    async function handleBlankTypeClick(aiResponseText, button) {
        button.disabled = true;
        button.textContent = 'Preenchendo...';

        // 1. Encontrar o campo de input. BLANK usa input[type="text"] ou input[type="number"].
        // Tentaremos encontrar o input mais relevante.
        const inputField = document.querySelector('input[type="text"][maxlength="3000"], input[type="text"], input[type="number"], input[data-cy="text-input"]');

        if (!inputField) {
            console.error("[BLANK] Campo de input para resposta não encontrado.");
            button.textContent = 'Erro (Input)!';
            button.style.backgroundColor = '#dc3545';
            return;
        }

        // 2. Inserir a resposta (remove qualquer numeração ou letra de opção que possa ter vindo)
        let cleanAnswer = aiResponseText.replace(/^(\w\))|(\w\))\s*/g, '').trim();
        inputField.value = cleanAnswer;

        // 3. Simular eventos
        try {
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.warn("[BLANK] Falha ao simular evento de input.", e);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // 4. Clicar em Enviar (Submit)
        const submitBtn = document.querySelector(PA_SUBMIT_BUTTON_SELECTOR);

        if (submitBtn && !submitBtn.disabled) {
            console.log("[BLANK] Texto inserido. Clicando em 'Enviar'...");
            submitBtn.click();
            button.textContent = 'Enviado!';
            button.style.backgroundColor = '#28a745';

            await new Promise(r => setTimeout(r, 1200));
        } else {
            button.textContent = 'Texto Inserido!';
            button.style.backgroundColor = '#ffc107';
            console.warn("[BLANK] Texto inserido, mas botão de Enviar não encontrado ou desabilitado.");
        }
    }
    // --- FIM handleBlankTypeClick ---


    function handleAISuccess(responseText, responseDiv, button, dataset) {
        try {
            const responseData = JSON.parse(responseText);
            const aiResponseText = responseData.choices[0].message.content;
            if (aiResponseText) {
                responseDiv.innerHTML = "✔️<br>" + aiResponseText.replace(/\n/g, '<br>');
                const autoButton = document.createElement('button');
                autoButton.className = 'qia-autoclick-button';
                autoButton.dataset.processed = "false";
                responseDiv.appendChild(autoButton);
                const kind = dataset.kind;
                if (kind === 'MCQ' || kind === 'MSQ') {
                    autoButton.textContent = '➡️ Clicar na Resposta';
                    autoButton.addEventListener('click', (e) => { e.target.dataset.processed = "true"; handleMCQClick(aiResponseText, autoButton); });
                } else if (kind === 'MATCH' || kind === 'CLASSIFICATION' || kind === 'DROPDOWN' || kind === 'DRAGNDROP' || kind === 'DND_IMAGE') {
                    autoButton.textContent = '➡️ Auto-Preencher';
                    autoButton.addEventListener('click', (e) => { e.target.dataset.processed = "true"; handleComplexClick(aiResponseText, kind, autoButton, dataset); });
                } else if (kind === 'OPEN') {
                    autoButton.textContent = '✍️ Digitar e Enviar';
                    autoButton.addEventListener('click', (e) => { e.target.dataset.processed = "true"; handleOpenTypeClick(aiResponseText, autoButton); });
                } else if (kind === 'BLANK') { // INTEGRAÇÃO DO NOVO BOTÃO
                    autoButton.textContent = '✍️ Preencher e Enviar';
                    autoButton.addEventListener('click', (e) => { e.target.dataset.processed = "true"; handleBlankTypeClick(aiResponseText, autoButton); });
                } else { autoButton.remove(); }
            } else { responseDiv.textContent = 'Erro: A IA não retornou uma resposta válida.'; }
        } catch (e) {
            responseDiv.textContent = 'Erro ao processar a resposta da IA.';
            console.error("Erro no parsing da IA:", e, responseText);
        }
        button.disabled = false; button.textContent = "Resolver com IA 🤖";
    }
    function getTextFromHTML(htmlString) { if (!htmlString) return ""; const tempDiv = document.createElement('div'); tempDiv.innerHTML = htmlString; return tempDiv.textContent || tempDiv.innerText || ""; }

    // --- FUNÇÃO DE LIMPEZA CORRIGIDA PARA NORMALIZAR TRAVESSÕES (FIX DO AUTO-CLICK) ---
    function cleanElementText(text) {
        if (!text) return "";

        // 1. Normaliza espaços invisíveis
        let cleaned = text.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ');

        // 2. Normaliza traços/travessões (en-dash, em-dash, non-breaking hyphen) para hífen padrão (-)
        cleaned = cleaned.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-');

        return cleaned.replace(/\s+/g, ' ') // 3. Substitui múltiplos espaços por um
            .trim()
            .replace(/(\.\.\.|\u2026)$/, '') // 4. Remove reticências finais
            .replace(/\.$/, '') // 5. Remove ponto final final
            .trim();
    }
    // --- FIM cleanElementText CORRIGIDA ---

    function findGuiItemByText(activeText) { if (!activeText) return null; const cleanActiveText = cleanElementText(activeText); const allItems = document.querySelectorAll('.qia-question-item'); for (const item of allItems) { if (item.dataset.questionText === cleanActiveText) { return item; } } for (const item of allItems) { const dataText = item.dataset.questionText; if (dataText && cleanActiveText && dataText.startsWith(cleanActiveText)) { return item; } } return null; }
    function applyFocus(activeText) { const allItems = document.querySelectorAll('.qia-question-item'); const activeItem = findGuiItemByText(activeText); allItems.forEach(item => { if (item === activeItem) { item.style.display = 'block'; item.classList.add('qia-focused'); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } else { item.style.display = 'none'; item.classList.remove('qia-focused'); } }); }
    function applyHighlight(activeText) { const allItems = document.querySelectorAll('.qia-question-item'); const activeItem = findGuiItemByText(activeText); allItems.forEach(item => { if (item === activeItem) { item.classList.add('qia-focused'); item.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } else { item.classList.remove('qia-focused'); } }); }
    function removeFocus() { document.querySelectorAll('.qia-question-item').forEach(item => { item.style.display = 'block'; item.classList.remove('qia-focused'); }); }
    function startQuestionObserver() { if (questionObserver) questionObserver.disconnect(); const targetNode = document.body; if (!targetNode) { console.warn("Não foi possível encontrar o nó 'document.body' para o Observer."); return; } const observerConfig = { childList: true, subtree: true, characterData: true }; const observerCallback = (mutationsList, observer) => { const activeQuestionEl = document.querySelector(ACTIVE_QUESTION_SELECTOR); if (activeQuestionEl) { const newText = cleanElementText(activeQuestionEl.parentElement.textContent); if (newText && newText !== currentActiveQuestionText) { currentActiveQuestionText = newText; window.dispatchEvent(new CustomEvent('ActiveQuestionChanged', { detail: currentActiveQuestionText })); } } }; questionObserver = new MutationObserver(observerCallback); questionObserver.observe(targetNode, observerConfig); }
    window.addEventListener('ActiveQuestionChanged', (event) => { const newText = event.detail; if (document.getElementById('qia-focus-toggle')?.checked) { applyFocus(newText); } else { applyHighlight(newText); } });
    function waitForElement(selector, timeout = 2000) { return new Promise((resolve, reject) => { const startTime = Date.now(); const interval = setInterval(() => { const element = document.querySelector(selector); if (element) { clearInterval(interval); resolve(element); } else if (Date.now() - startTime > timeout) { clearInterval(interval); reject(new Error(`Elemento "${selector}" não encontrado após ${timeout}ms.`)); } }, 100); }); }
    // (Função cleanElementText duplicada removida - usando a versão completa acima)
    function simulateKeyPress(key) { try { const keyCode = key.toString().charCodeAt(0); const event = new KeyboardEvent('keydown', { key: key.toString(), code: `Digit${key}`, keyCode: keyCode, which: keyCode, bubbles: true, cancelable: true }); document.body.dispatchEvent(event); } catch (e) { console.error("Falha ao simular tecla:", e); } }
    function findDragDropKeyByText(text) { const searchText = cleanElementText(text); const elements = document.querySelectorAll('.drag-option.option-highlight'); for (const el of elements) { const textElement = el.querySelector('.dnd-option-text'); if (textElement && cleanElementText(textElement.textContent) === searchText) { const keyElement = el.querySelector('.keyboard-interaction-shortcuts'); if (keyElement) { return keyElement.textContent.trim(); } } } console.warn(`[DRAGNDROP] Atalho de teclado para o texto "${text}" não foi encontrado.`); return null; }
    function findDragDropTargetByIndex(index) { const placeholders = document.querySelectorAll('button.drag-and-drop-blank, button.droppable-blank'); if (placeholders.length > index) { return placeholders[index]; } console.warn(`[DRAGNDROP] Alvo no índice ${index} não foi encontrado.`); return null; }
    function findDndImageTargetByIndex(index) {
        // Seletor correto: button.droppable-blank.drag-and-drop-image-blank
        const targets = document.querySelectorAll('button.droppable-blank.drag-and-drop-image-blank');
        if (targets.length > index) { return targets[index]; }
        // Fallback
        const fallback = document.querySelectorAll('button.droppable-blank');
        if (fallback.length > index) { return fallback[index]; }
        console.warn(`[DND_IMAGE] Alvo no índice ${index} não foi encontrado.`);
        return null;
    }

    // Encontra alvo pelo ID do target (usado quando temos o ID do JSON)
    function findDndImageTargetById(targetId) {
        // Busca pelo ID direto ou pelo data-cy
        const target = document.querySelector(`button#${targetId}`) ||
            document.querySelector(`button[data-cy="droppable-blank-${targetId}"]`) ||
            document.querySelector(`button[id="${targetId}"]`);
        if (target) { return target; }
        console.warn(`[DND_IMAGE] Alvo com ID "${targetId}" não foi encontrado.`);
        return null;
    }

    // Encontra a opção arrastável pelo texto e retorna o ELEMENTO para clicar
    function findDndImageOptionByText(text) {
        const searchText = cleanElementText(text);
        // Seletor correto: .drag-option-dnd-image com texto em .dnd-image-options-text p
        const elements = document.querySelectorAll('.drag-option-dnd-image');
        for (const el of elements) {
            const textElement = el.querySelector('.dnd-image-options-text p, p');
            if (textElement && cleanElementText(textElement.textContent) === searchText) {
                return el; // Retorna o elemento para clicar
            }
        }
        console.warn(`[DND_IMAGE] Opção "${text}" não foi encontrada.`);
        return null;
    }
    // --- FIM FUNÇÕES DND_IMAGE ---
    function findClickableElementByText(text) { const searchText = text.trim(); const optionElements = document.querySelectorAll('.option-inner, .option'); for (const el of optionElements) { const p = el.querySelector('p'); if (p) { const elementText = cleanElementText(p.textContent); if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) { return el; } } } console.warn(`Elemento com texto "${text}" não foi encontrado.`); return null; }
    function findMatchElementByText(text, elementType) { const searchText = text.trim(); const elements = document.querySelectorAll('.match-order-option'); for (const el of elements) { const isDestination = el.classList.contains('is-drop-tile'); const isSource = el.classList.contains('is-option-tile'); if ((elementType === 'destination' && !isDestination) || (elementType === 'source' && !isSource)) continue; const textElement = el.querySelector('div[id="optionText"]'); if (textElement) { const elementText = cleanElementText(textElement.textContent); if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) { return el.querySelector('button.match-order-option-inner') || el; } } } console.warn(`[MATCH] Elemento com texto "${text}" (${elementType}) não foi encontrado.`); return null; }
    function findClassificationElementByText(text) { const searchText = text.trim(); const elements = document.querySelectorAll('.classification-group .cursor-grab'); for (const el of elements) { const textElement = el.querySelector('div[id="optionText"]'); if (textElement) { const elementText = cleanElementText(textElement.textContent); if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) { return el; } } } console.warn(`[CLASSIFICATION] Elemento de origem com texto "${text}" não foi encontrado.`); return null; }
    function findDropdownPlaceholder(index) { const placeholders = document.querySelectorAll('button.options-dropdown'); if (placeholders.length > index) { return placeholders[index]; } console.warn(`[DROPDOWN] Placeholder no índice ${index} não foi encontrado.`); return null; }
    function findDropdownOption(text) { const options = document.querySelectorAll('button.dropdown-option'); for (const option of options) { const textElement = option.querySelector('.resizeable'); if (textElement && textElement.textContent.trim().includes(text)) { return option; } } console.warn(`[DROPDOWN] Opção com texto "${text}" não foi encontrada.`); return null; }
    async function handleMCQClick(aiResponseText, button) { button.disabled = true; const answers = aiResponseText.split('\n').filter(Boolean); let clickedCount = 0; for (const answer of answers) { const cleanAnswerText = cleanElementText(answer.substring(answer.indexOf(')') + 1)); if (!cleanAnswerText) continue; const targetElement = findClickableElementByText(cleanAnswerText); if (targetElement) { targetElement.click(); clickedCount++; await new Promise(resolve => setTimeout(resolve, 300)); } } if (clickedCount === answers.length && answers.length > 0) { button.textContent = 'Clicado!'; } else if (clickedCount > 0) { button.textContent = `Clicado (${clickedCount}/${answers.length})`; button.style.backgroundColor = '#ffc107'; } else { button.textContent = 'Não encontrado!'; button.style.backgroundColor = '#dc3545'; } }
    async function handleComplexClick(aiResponseText, kind, button, dataset) {
        button.disabled = true; button.textContent = 'Preenchendo...'; const panel = document.getElementById('qia-panel'); let pairs = [];
        if (kind === 'MATCH') { pairs = aiResponseText.split('\n').filter(line => line.includes('->')).map(line => { const parts = line.split('->'); if (parts.length === 2) { const source = cleanElementText(parts[0].replace(/^-/, '')); const destination = cleanElementText(parts[1]); return { source, destination }; } return null; }).filter(Boolean); }
        else if (kind === 'CLASSIFICATION') { const lines = aiResponseText.split('\n').filter(line => line.trim() !== ''); let currentCategory = ''; for (const line of lines) { if (line.endsWith(':')) currentCategory = cleanElementText(line.slice(0, -1)); else if (line.startsWith('- ') && currentCategory) pairs.push({ source: cleanElementText(line.substring(2)), destination: currentCategory }); } }
        else if (kind === 'DROPDOWN' || kind === 'DRAGNDROP' || kind === 'DND_IMAGE') { pairs = aiResponseText.split('\n').map(line => { const match = line.match(/^(\d+):\s*(.*)/); if (match) return { index: parseInt(match[1], 10) - 1, text: cleanElementText(match[2]) }; return null; }).filter(Boolean); }
        if (pairs.length === 0) { button.textContent = 'Falha ao analisar!'; button.style.backgroundColor = '#dc3545'; if (panel) panel.classList.remove('qia-minimized'); return; }
        if (panel && !isMasterAutoModeOn) panel.classList.add('qia-minimized'); await new Promise(resolve => setTimeout(resolve, 400));
        try {
            let successCount = 0;
            if (kind === 'MATCH') { for (const pair of pairs) { const sourceEl = findMatchElementByText(pair.source, 'source'); if (!sourceEl) { console.error(`Origem não encontrada: "${pair.source}"`); continue; } sourceEl.click(); await new Promise(resolve => setTimeout(resolve, 300)); const destEl = findMatchElementByText(pair.destination, 'destination'); if (!destEl) { console.error(`Destino não encontrado: "${pair.destination}"`); sourceEl.click(); continue; } destEl.click(); successCount++; await new Promise(resolve => setTimeout(resolve, 600)); } }
            else if (kind === 'CLASSIFICATION') { const targets = JSON.parse(decodeURIComponent(dataset.targets)).map(t => cleanElementText(t)); if (!targets) throw new Error("Categorias de destino não encontradas no dataset."); for (const pair of pairs) { const sourceEl = findClassificationElementByText(pair.source); if (!sourceEl) { console.error(`Origim não encontrada: "${pair.source}"`); continue; } sourceEl.click(); await new Promise(resolve => setTimeout(resolve, 300)); const destIndex = targets.indexOf(pair.destination); if (destIndex === -1) { console.error(`Destino não encontrado no dataset: "${pair.destination}"`); sourceEl.click(); continue; } const dropzones = document.querySelectorAll('.glowing-dropzone'); const destEl = dropzones[destIndex]; if (!destEl) { console.error(`Dropzone no índice ${destIndex} não encontrado.`); sourceEl.click(); continue; } destEl.click(); successCount++; await new Promise(resolve => setTimeout(resolve, 600)); } }
            else if (kind === 'DROPDOWN') { for (const item of pairs) { const placeholder = findDropdownPlaceholder(item.index); if (!placeholder) continue; placeholder.click(); await new Promise(resolve => setTimeout(resolve, 500)); const option = findDropdownOption(item.text); if (!option) { console.error(`Opção Dropdown não encontrada: "${item.text}"`); continue; } option.click(); successCount++; await new Promise(resolve => setTimeout(resolve, 500)); } }
            else if (kind === 'DRAGNDROP') { for (const item of pairs) { const targetEl = findDragDropTargetByIndex(item.index); if (!targetEl) { console.error(`[DRAGNDROP] Alvo no índice ${item.index} não foi encontrado.`); continue; } targetEl.click(); let keyToPress; try { await waitForElement('.keyboard-interaction-shortcuts', 2000); await new Promise(resolve => setTimeout(resolve, 100)); keyToPress = findDragDropKeyByText(item.text); } catch (e) { console.error(`[DRAGNDROP] Pop-up de opções não apareceu.`, e); targetEl.click(); continue; } if (!keyToPress) { console.error(`[DRAGNDROP] Não foi possível encontrar a tecla para "${item.text}"`); targetEl.click(); continue; } simulateKeyPress(keyToPress); successCount++; await new Promise(resolve => setTimeout(resolve, 600)); } }
            else if (kind === 'DND_IMAGE') {
                // DND_IMAGE: Usa IDs dos targets para encontrar os botões corretos
                const targetsData = JSON.parse(decodeURIComponent(dataset.targets));

                for (const item of pairs) {
                    // Pega o ID do target pelo índice da resposta da IA
                    const targetInfo = targetsData[item.index];
                    if (!targetInfo) {
                        console.error(`[DND_IMAGE] Target info no índice ${item.index} não encontrado no dataset.`);
                        continue;
                    }

                    // Encontra o botão pelo ID
                    const targetEl = findDndImageTargetById(targetInfo.id);
                    if (!targetEl) {
                        console.error(`[DND_IMAGE] Alvo com ID "${targetInfo.id}" não foi encontrado.`);
                        continue;
                    }

                    console.log(`[DND_IMAGE] Clicando no alvo ${item.index + 1} (ID: ${targetInfo.id})...`);
                    targetEl.click();
                    await new Promise(resolve => setTimeout(resolve, 400));

                    // Encontra e clica na opção correta
                    const optionEl = findDndImageOptionByText(item.text);
                    if (!optionEl) {
                        console.error(`[DND_IMAGE] Opção "${item.text}" não encontrada.`);
                        continue;
                    }

                    console.log(`[DND_IMAGE] Clicando na opção "${item.text}"...`);
                    optionEl.click();
                    successCount++;
                    console.log(`[DND_IMAGE] ✅ Opção "${item.text}" colocada no alvo ${item.index + 1}`);
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            }
            button.textContent = `Concluído (${successCount}/${pairs.length})`;
            if (successCount < pairs.length) button.style.backgroundColor = '#ffc107';
        } finally { if (panel && !isMasterAutoModeOn) panel.classList.remove('qia-minimized'); }
    }
    function startMasterLoop() {
        if (masterInterval) clearInterval(masterInterval);
        const speed = tyzzizConfig.autoPilotSpeed || 750;
        masterInterval = setInterval(async () => {
            if (isAutoTaskRunning) return;
            isAutoTaskRunning = true;
            try { await masterAutoPilotTask(); }
            catch (e) { console.error("Erro no Piloto Automático:", e); }
            isAutoTaskRunning = false;
        }, speed);
    }
    async function masterAutoPilotTask() {
        const activeQuestionEl = document.querySelector(ACTIVE_QUESTION_SELECTOR);
        let newText = "";
        if (activeQuestionEl) { newText = cleanElementText(activeQuestionEl.parentElement.textContent); if (newText && newText !== currentActiveQuestionText) { console.log("PA: Nova pergunta detectada:", newText); currentActiveQuestionText = newText; } } else { currentActiveQuestionText = ""; }
        if (document.getElementById('qia-focus-toggle')?.checked) { applyFocus(currentActiveQuestionText); } else { applyHighlight(currentActiveQuestionText); }
        const activeItem = findGuiItemByText(currentActiveQuestionText);
        if (activeItem) {
            const autoFillBtn = activeItem.querySelector('.qia-autoclick-button[data-processed="false"]');
            if (autoFillBtn) {
                console.log("PA: Clicando em 'Auto-Preencher'...");
                autoFillBtn.click();
                await new Promise(r => setTimeout(r, 1200));
                return;
            }
            const solveBtn = activeItem.querySelector('.qia-ai-button:not([data-processed="true"])');
            if (solveBtn) { console.log("PA: Clicando em 'Resolver com IA'..."); solveBtn.click(); return; }
        }
        const submitBtn = document.querySelector(PA_SUBMIT_BUTTON_SELECTOR);
        if (submitBtn && !submitBtn.disabled && tyzzizConfig.autoSubmit) {
            console.log("PA: Clicando em 'Enviar'...");
            submitBtn.click();
            await new Promise(r => setTimeout(r, 1200));
            return;
        }
        const nextBtn = document.querySelector(PA_NEXT_BUTTON_SELECTOR);
        if (nextBtn && !nextBtn.disabled) {
            const rect = nextBtn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                console.log("PA: Clicando em 'Próximo'...");
                nextBtn.click();
                await new Promise(r => setTimeout(r, 1200));
                return;
            }
        }
    }

})();
