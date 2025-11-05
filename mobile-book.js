(function() {
    'use strict';

    // ##################################################################
    // #               URL DO SEU WORKER CONFIGURADA                    #
    // ##################################################################
    const PROXY_URL = "https://api-banco.pintoassado390.workers.dev";
    // ##################################################################

    // --- SELETORES GLOBAIS ---
    const ACTIVE_QUESTION_SELECTOR = ".question-text-color";
    const PA_SUBMIT_BUTTON_SELECTOR = 'button[data-cy="submit-button"]';
    const PA_NEXT_BUTTON_SELECTOR = '.right-navigator, .slide-next-button, .next-question-button';

    // --- PARTE 1: INTERCEPTADOR (v13.27 - Sem alterações) ---
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
                    } catch (e) {}
                    if (url.includes('/playerGameOver') || url.includes('/player-summary')) {
                        window.dispatchEvent(new CustomEvent('GameEnded'));
                    }
                }
                return response;
            };
        }
    });
    const originalXHR_open=XMLHttpRequest.prototype.open;const originalXHR_send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(...e){return this._requestURL=e[1],originalXHR_open.apply(this,e)};XMLHttpRequest.prototype.send=function(...e){return this.addEventListener("load",function(){if(this._requestURL&&this._requestURL.includes("/play-api/")){try{const e=JSON.parse(this.responseText);e?.room?.questions&&"object"==typeof e.room.questions&&!Array.isArray(e.room.questions)&&!gameDataHasBeenProcessed&&(gameDataHasBeenProcessed=!0,window.dispatchEvent(new CustomEvent("GameDataIntercepted",{detail:e})))}catch(e){}(this._requestURL.includes("/playerGameOver")||this._requestURL.includes("/player-summary"))&&window.dispatchEvent(new CustomEvent("GameEnded"))}}),originalXHR_send.apply(this,e)};


    // --- PARTE 2: GUI (v13.27 - COM MODIFICAÇÕES PARA MOBILE) ---
    let isGUIReady = false;
    let gameDataForGUI = null;
    let currentActiveQuestionText = "";
    let questionObserver = null;

    let isMasterAutoModeOn = false;
    let masterInterval = null;
    let isAutoTaskRunning = false;

    window.addEventListener('GameDataIntercepted', function(event) {
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

    function createGUI() {
        isGUIReady = true;
        
        // ##################################################################
        // #               BLOCO DE ESTILO MODIFICADO                     #
        // # Adicionada @media query para telas menores (max-width: 600px) #
        // ##################################################################
        const styles = `
            #qia-panel { position: fixed; top: 20px; right: 20px; width: 380px; max-height: 90vh; background-color: #ffffff;
                border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                font-family: Arial, sans-serif; z-index: 99999; display: flex; flex-direction: column;
                transition: width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, opacity 0.3s ease;
                transform-origin: top right; overflow: hidden; }
            #qia-panel.qia-minimized { width: 50px; height: 50px; border-radius: 50%; opacity: 1; pointer-events: auto; }
            #qia-panel.qia-minimized #qia-header, #qia-panel.qia-minimized #qia-content { display: none; }
            #qia-header { padding: 10px 15px; background-color: #f5f5f5; border-bottom: 1px solid #e0e0e0; cursor: move;
                display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 12px; border-top-right-radius: 12px; flex-shrink: 0; }
            #qia-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
            #qia-controls { display: flex; align-items: center; }
            #qia-controls button, #qia-controls label { background: none; border: none; cursor: pointer; font-size: 20px; margin-left: 10px; opacity: 0.7; padding: 0 5px; }
            #qia-controls button:hover, #qia-controls label:hover { opacity: 1; }
            #qia-controls input[type="checkbox"] { display: none; }
            #qia-controls input[type="checkbox"] + label { font-size: 22px; line-height: 1; user-select: none; }
            #qia-controls input[type="checkbox"]:checked + label { opacity: 1; filter: saturate(2); background-color: #e0e8ff; border-radius: 4px; }
            #qia-auto-mode-btn.qia-auto-mode-on { opacity: 1; filter: saturate(2); background-color: #e0ffe8; border-radius: 4px; }

            #qia-content { padding: 15px; overflow-y: auto; flex-grow: 1; }
            #qia-restore-btn-circle { display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 28px; cursor: move; user-select: none; }
            #qia-panel.qia-minimized #qia-restore-btn-circle { display: flex; }
            .qia-question-item { margin-bottom: 15px; padding: 10px; border: 1px solid #eee; border-radius: 8px; transition: border 0.3s ease, background-color 0.3s ease; }
            .qia-question-item.qia-focused { border: 2px solid #4285F4; background-color: #f8f9fa; }
            .qia-question-item p { margin: 5px 0; color: #111; }
            .qia-question-text { font-weight: bold; }
            .qia-options-list { list-style: none; padding-left: 15px; font-size: 14px; color: #333; }
            .qia-options-list b { font-weight: 600; }
            .qia-ai-button { cursor: pointer; padding: 4px 10px; border: 1px solid #ccc; border-radius: 5px; background-color: #f0f0f0; margin-top: 10px; font-size: 12px; }
            .qia-ai-button:disabled { cursor: not-allowed; opacity: 0.5; }
            .qia-ai-response { margin-top: 8px; padding: 8px; border-left: 3px solid #4285F4; background-color: #e8f0fe; font-size: 14px; white-space: pre-wrap; font-weight: bold; color: #174ea6;}
            .qia-autoclick-button { cursor: pointer; padding: 4px 10px; border: 1px solid #28a745; border-radius: 5px; background-color: #28a745; color: white; margin-top: 8px; margin-left: 5px; font-size: 12px; }
            .qia-autoclick-button:disabled { background-color: #ccc; border-color: #ccc; cursor: not-allowed; }

            /* --- ESTILOS ADICIONADOS PARA MOBILE --- */
            @media (max-width: 600px) {
                #qia-panel {
                    /* Ocupa a largura da tela com pequenas margens */
                    top: 10px;
                    left: 10px;
                    right: 10px;
                    width: auto; /* Remove a largura fixa */
                    max-width: calc(100vw - 20px);
                    max-height: 85vh; /* Ajusta a altura máxima */
                    transform-origin: top center;
                }
                #qia-panel.qia-minimized {
                    /* Reposiciona a bolha minimizada */
                    left: auto; /* Remove o 'left: 10px' da versão expandida */
                    right: 10px;
                    top: 10px;
                    width: 50px;
                    height: 50px;
                }
                #qia-header h3 {
                    font-size: 17px; /* Aumenta o título */
                }
                #qia-controls {
                    margin-left: 10px;
                }
                #qia-controls button, #qia-controls label {
                    font-size: 22px; /* Aumenta os ícones de controle */
                    margin-left: 8px;
                }
                #qia-content {
                    padding: 10px; /* Reduz padding */
                }
                .qia-question-item {
                    padding: 8px;
                }
                .qia-options-list, .qia-ai-response {
                    font-size: 15px; /* Aumenta a fonte do conteúdo */
                }
                /* Aumenta os botões de ação para facilitar o toque */
                .qia-ai-button, .qia-autoclick-button {
                    font-size: 14px;
                    padding: 8px 12px;
                    margin-top: 12px;
                }
            }
        `;
        // ##################################################################
        // #                 FIM DO BLOCO DE ESTILO MODIFICADO            #
        // ##################################################################

        const styleSheet = document.createElement("style"); styleSheet.innerText = styles; document.head.appendChild(styleSheet);

        const panelHTML = `
            <div id="qia-header">
                <h3>🧠 Assistente IA (Groq)</h3>
                <div id="qia-controls">
                    <button id="qia-auto-mode-btn" title="Piloto Automático">🚀</button>
                    <button id="qia-reload-btn" title="Resetar (Detectar Novo Jogo)">🔄</button>
                    <input type="checkbox" id="qia-focus-toggle">
                    <label for="qia-focus-toggle" title="Modo Foco">🎯</label>
                    <button id="qia-minimize-btn" title="Minimizar">➖</button>
                </div>
            </div>
            <div id="qia-content"><p>Aguardando o início do jogo...</p></div>
            <div id="qia-restore-btn-circle">🧠</div>`;

        const panel = document.createElement("div"); panel.id = "qia-panel"; panel.innerHTML = panelHTML; document.body.appendChild(panel);

        const qiaPanel = document.getElementById('qia-panel');
        const header = document.getElementById('qia-header');
        const restoreBtn = document.getElementById('qia-restore-btn-circle');
        let isDragging = false; let wasDragging = false; let offset = {x: 0, y: 0};
        
        // NOTA: O 'drag' (arrastar) abaixo usa eventos de mouse (mousedown, mousemove).
        // Isso NÃO funcionará em telas de toque (touch). 
        // A funcionalidade de minimizar/restaurar via clique nos botões continuará funcionando.
        const dragStart = (e) => { if (e.button !== 0) return; isDragging = true; wasDragging = false; offset.x = e.clientX - qiaPanel.offsetLeft; offset.y = e.clientY - qiaPanel.offsetTop; };
        header.addEventListener('mousedown', dragStart);
        restoreBtn.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', (e) => { if (isDragging) { wasDragging = true; qiaPanel.style.left = `${e.clientX - offset.x}px`; qiaPanel.style.top = `${e.clientY - offset.y}px`; } });
        document.addEventListener('mouseup', () => { isDragging = false; });

        document.getElementById('qia-minimize-btn').addEventListener('click', () => { qiaPanel.classList.toggle('qia-minimized'); });
        restoreBtn.addEventListener('click', () => {
            if (!wasDragging) {
                // Remove a lógica de reposicionamento em tela cheia, pois o CSS de @media já cuida disso.
                qiaPanel.classList.toggle('qia-minimized');
            }
            wasDragging = false;
        });
        document.getElementById('qia-focus-toggle').addEventListener('change', (e) => {
            if (e.target.checked) {
                if(!isMasterAutoModeOn) startQuestionObserver();
                applyFocus(currentActiveQuestionText);
            } else {
                if(!isMasterAutoModeOn) startQuestionObserver();
                removeFocus();
            }
        });

        document.getElementById('qia-reload-btn').addEventListener('click', () => {
            console.log("Assistente IA: Resetando para o próximo jogo...");
            gameDataHasBeenProcessed = false; gameDataForGUI = null; currentActiveQuestionText = "";

            if (masterInterval) clearInterval(masterInterval);
            masterInterval = null;
            isMasterAutoModeOn = false;
            const autoBtn = document.getElementById('qia-auto-mode-btn');
            if(autoBtn) autoBtn.classList.remove('qia-auto-mode-on');

            if (questionObserver) questionObserver.disconnect();
            startQuestionObserver();

            const contentDiv = document.getElementById('qia-content');
            if (contentDiv) contentDiv.innerHTML = '<p>Aguardando o início do jogo...</p>';
            const focusToggle = document.getElementById('qia-focus-toggle');
            if (focusToggle) focusToggle.checked = false;
            removeFocus();
        });

        document.getElementById('qia-auto-mode-btn').addEventListener('click', (e) => {
            isMasterAutoModeOn = !isMasterAutoModeOn;
            e.target.classList.toggle('qia-auto-mode-on', isMasterAutoModeOn);
            if (isMasterAutoModeOn) {
                console.log("Piloto Automático: LIGADO");
                if (questionObserver) questionObserver.disconnect();
                startMasterLoop();
            } else {
                console.log("Piloto Automático: DESLIGADO");
                if (masterInterval) clearInterval(masterInterval);
                startQuestionObserver();
            }
        });

        if(gameDataForGUI)populateGUI(gameDataForGUI.room.questions);
    }

    if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', createGUI); } else { createGUI(); }

    function populateGUI(questions) {
        const contentDiv = document.getElementById('qia-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '<p style="font-weight: bold; margin-bottom: 15px;">Jogo detectado! Pronto para resolver.</p>';

        for (const qId in questions) {
            const questionInfo = questions[qId];
            const questionText = getTextFromHTML(questionInfo.structure?.query?.text);
            const questionKind = questionInfo.structure.kind;

            const itemDiv = document.createElement('div');
            itemDiv.className = 'qia-question-item';
            itemDiv.dataset.questionText = cleanElementText(questionText.replace(/<blank.*?>/g, ' '));

            let questionHTML = ``;
            let buttonHTML = '';

            switch (questionKind) {
                case 'MCQ': case 'MSQ':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const mcqOptions = questionInfo.structure.options.map((opt, i) => ({ text: getTextFromHTML(opt.text), index: String.fromCharCode(65 + i) }));
                    questionHTML += `<ul class="qia-options-list">${mcqOptions.map(opt => `<li>${opt.index}) ${opt.text}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="${questionKind}" data-question="${encodeURIComponent(questionText)}" data-options="${encodeURIComponent(JSON.stringify(mcqOptions.map(o => `${o.index}) ${o.text}`)))}">Resolver com IA 🤖</button>`;
                    break;
                case 'MATCH':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const matchItems = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    const matchPrompts = questionInfo.structure.matches.map(p => getTextFromHTML(p.text));
                    questionHTML += `<ul class="qia-options-list"><b>Itens:</b>${matchItems.map(p => `<li>${p}</li>`).join('')}</ul>`;
                    questionHTML += `<ul class="qia-options-list"><b>Combinações:</b>${matchPrompts.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="MATCH" data-question="${encodeURIComponent(questionText)}" data-items="${encodeURIComponent(JSON.stringify(matchItems))}" data-matches="${encodeURIComponent(JSON.stringify(matchPrompts))}">Resolver com IA 🤖</button>`;
                    break;
                case 'CLASSIFICATION':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const classOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    const classTargets = questionInfo.structure.targets.map(t => t.name);
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${classOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    questionHTML += `<ul class="qia-options-list"><b>Categorias:</b>${classTargets.map(t => `<li>${t}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="CLASSIFICATION" data-question="${encodeURIComponent(questionText)}" data-options="${encodeURIComponent(JSON.stringify(classOptions))}" data-targets="${encodeURIComponent(JSON.stringify(classTargets))}">Resolver com IA 🤖</button>`;
                    break;
                case 'DROPDOWN':
                    const dropdownQuestionText = getTextFromHTML(questionInfo.structure.query.text.replace(/<blank.*?>/g, ' [___] '));
                    const dropdownOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML = `<p class="qia-question-text">${dropdownQuestionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${dropdownOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="DROPDOWN" data-question="${encodeURIComponent(questionInfo.structure.query.text)}" data-options="${encodeURIComponent(JSON.stringify(dropdownOptions))}">Resolver com IA 🤖</button>`;
                    break;
                case 'DRAGNDROP':
                    const dragndropQuestionText = getTextFromHTML(questionInfo.structure.query.text.replace(/<blank.*?>/g, ' [___] '));
                    const dragndropOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML = `<p class="qia-question-text">${dragndropQuestionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Opções:</b>${dragndropOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="DRAGNDROP" data-question="${encodeURIComponent(questionInfo.structure.query.text)}" data-options="${encodeURIComponent(JSON.stringify(dragndropOptions))}">Resolver com IA 🤖</button>`;
                    break;
                case 'REORDER':
                    const reorderOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
                    questionHTML += `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    questionHTML += `<ul class="qia-options-list"><b>Para Ordenar:</b>${reorderOptions.map(o => `<li>${o}</li>`).join('')}</ul>`;
                    buttonHTML = `<button class="qia-ai-button" data-kind="REORDER" data-question="${encodeURIComponent(questionText)}" data-options="${encodeURIComponent(JSON.stringify(reorderOptions))}">Resolver com IA 🤖</button>`;
                    break;
                default: continue;
            }
            itemDiv.innerHTML = `${questionHTML}${buttonHTML}<div class="qia-ai-response" style="display:none;"></div>`;
            contentDiv.appendChild(itemDiv);
        }
        contentDiv.querySelectorAll('.qia-ai-button').forEach(button => { button.addEventListener('click', handleSolveClick); });
    }

    // --- PARTE 3: LÓGICA DA IA (v13.26 - Sem alterações) ---

    function handleSolveClick(event) {
        const button = event.target;
        const responseDiv = button.nextElementSibling;
        const oldAutoClickBtn = button.parentElement.querySelector('.qia-autoclick-button');
        if (oldAutoClickBtn) oldAutoClickBtn.remove();
        button.dataset.processed = "true";
        button.disabled = true; button.textContent = "Pensando...";
        responseDiv.style.display = 'block'; responseDiv.textContent = 'Analisando...';
        buildPromptAndCallAI(button.dataset, responseDiv, button);
    }

    function buildPromptAndCallAI(dataset, responseDiv, button) {
        const { kind, question } = dataset;
        let prompt = '';
        switch (kind) {
            case 'MCQ':
                const mcqOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de MÚLTIPLA ESCOLHA (MCQ). Esta pergunta tem APENAS UMA resposta correta. Sua tarefa é determinar a ÚNICA alternativa correta. Responda APENAS com a letra e o texto completo dessa alternativa. NÃO inclua nenhuma outra opção, introdução, observação ou texto explicativo.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n${mcqOptions.join('\n')}`;
                break;
            case 'MSQ':
                const msqOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de MÚLTIPLA SELEÇÃO (MSQ). Esta pergunta pode ter UMA OU MAIS respostas corretas. Sua tarefa é determinar TODAS as alternativas corretas. Responda APENAS com a letra e o texto completo de cada alternativa correta, uma por linha. NÃO inclua nenhuma introdução, observação ou texto explicativo.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n${msqOptions.join('\n')}`;
                break;
            case 'MATCH':
                const items = JSON.parse(decodeURIComponent(dataset.items));
                const matches = JSON.parse(decodeURIComponent(dataset.matches));
                prompt = `Analise a seguinte pergunta de combinação. Você receberá uma lista de "Itens" e uma lista de "Combinações". Sua tarefa é combinar cada item da primeira lista com sua opção correta da segunda lista. Responda APENAS com a lista de pares, um por linha, no formato: "Item -> Combinação Correta". NÃO inclua nenhuma introdução, observação ou texto explicativo. Apenas as linhas de combinação.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nItens:\n- ${items.join('\n- ')}\n\nCombinações:\n- ${matches.join('\n- ')}`;
                break;
            case 'CLASSIFICATION':
                const classOptions = JSON.parse(decodeURIComponent(dataset.options));
                const targets = JSON.parse(decodeURIComponent(dataset.targets));
                prompt = `Analise a seguinte pergunta de classificação. Sua tarefa é atribuir cada "Opção" à sua "Categoria" correta. Responda APENAS com as categorias e suas opções, um item por linha, começando com "- ". NÃO inclua nenhuma introdução, observação ou texto explicativo. Exemplo de formato:\nCategoria 1:\n- Opção A\n- Opção C\n\nCategoria 2:\n- Opção B\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nOpções:\n- ${classOptions.join('\n- ')}\n\nCategorias:\n- ${targets.join('\n- ')}`;
                break;
            case 'DROPDOWN':
                const dropdownQuestion = decodeURIComponent(dataset.question);
                const dropdownOptionsAI = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta com lacunas para preencher (dropdowns). O texto da pergunta contém tags como <blank id=...></blank>. Sua tarefa é determinar qual opção da lista de "Opções" se encaixa em cada lacuna. Responda APENAS com uma lista numerada, uma para cada lacuna na ordem em que aparecem. Formato: "1: [Opção Correta]", "2: [Opção Correta]", etc. NÃO inclua nenhuma introdução, observação ou texto explicativo.\n\nPergunta:\n"${dropdownQuestion}"\n\nOpções Disponíveis:\n- ${dropdownOptionsAI.join('\n- ')}`;
                break;
            case 'DRAGNDROP':
                const dragndropQuestion = decodeURIComponent(dataset.question);
                const dragndropOptionsAI = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de ARRASTAR E SOLTAR (drag and drop). O texto da pergunta contém tags como <blank id=...></blank>. Sua tarefa é determinar qual opção da lista de "Opções" se encaixa em cada lacuna. Responda APENAS com uma lista numerada, uma para cada lacuna na ordem em que aparecem. Formato: "1: [Opção Correta]", "2: [Opção Correta]", etc. NÃO inclua nenhuma introdução, observação ou texto explicativo.\n\nPergunta:\n"${dragndropQuestion}"\n\nOpções Disponíveis:\n- ${dragndropOptionsAI.join('\n- ')}`;
                break;
            case 'REORDER':
                const reorderOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de ordenação. Sua tarefa é colocar a lista de "Itens para Ordenar" na sequência correta. Responda APENAS com uma lista numerada, começando em 1, na ordem correta. NÃO inclua nenhuma introdução, observação ou texto explicativo.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nItens para Ordenar:\n- ${reorderOptions.join('\n- ')}`;
                break;
        }
        performProxyRequest(prompt, responseDiv, button, dataset);
    }

    // ##################################################################
    // #                     FUNÇÃO MODIFICADA                          #
    // #  GM_xmlhttpRequest foi substituído por 'fetch' (async/await)   #
    // ##################################################################
    async function performProxyRequest(prompt, responseDiv, button, dataset) {
        try {
            const response = await fetch(PROXY_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [{ role: "user", content: prompt }]
                })
            });

            if (!response.ok) {
                let errorMsg = 'Erro desconhecido';
                try {
                    const errorData = await response.json();
                    errorMsg = errorData?.error || `Erro ${response.status}`;
                } catch (e) {
                    errorMsg = `Erro: ${response.status}. O proxy não respondeu corretamente.`;
                }
                responseDiv.textContent = `Erro do Proxy: ${errorMsg}`;
                if (button) {
                    button.disabled = false; button.textContent = "Resolver com IA 🤖";
                }
                return;
            }

            const responseText = await response.text();
            handleAISuccess(responseText, responseDiv, button, dataset);

        } catch (error) {
            // Erro de rede, DNS, ou mais provavelmente... CORS
            responseDiv.textContent = 'Erro de rede (CORS?). Não foi possível conectar ao proxy.';
            if (button) {
                button.disabled = false; button.textContent = "Resolver com IA 🤖";
            }
            console.error("Erro na requisição para o Proxy:", error);
        }
    }
    // ##################################################################
    // #                     FIM DA MODIFICAÇÃO                       #
    // ##################################################################


    function handleAISuccess(responseText, responseDiv, button, dataset) {
         try {
            const responseData = JSON.parse(responseText);
            const aiResponseText = responseData.choices?.[0]?.message?.content;
            if (aiResponseText) {
                responseDiv.innerHTML = "✔️<br>" + aiResponseText.replace(/\n/g, '<br>');
                const autoButton = document.createElement('button');
                autoButton.className = 'qia-autoclick-button';
                autoButton.dataset.processed = "false";
                responseDiv.appendChild(autoButton);

                const kind = dataset.kind;
                if (kind === 'MCQ' || kind === 'MSQ') {
                    autoButton.textContent = '➡️ Clicar na Resposta';
                    autoButton.addEventListener('click', (e) => {
                        e.target.dataset.processed = "true";
                        handleMCQClick(aiResponseText, autoButton);
                    });
                } else if (kind === 'MATCH' || kind === 'CLASSIFICATION' || kind === 'DROPDOWN' || kind === 'DRAGNDROP') {
                    autoButton.textContent = '➡️ Auto-Preencher';
                    autoButton.addEventListener('click', (e) => {
                        e.target.dataset.processed = "true";
                        handleComplexClick(aiResponseText, kind, autoButton, dataset);
                    });
                } else {
                    autoButton.remove();
                }
            } else {
                responseDiv.textContent = 'Erro: A IA não retornou uma resposta válida.';
            }
        } catch (e) {
             responseDiv.textContent = 'Erro ao processar a resposta da IA.';
             console.error("Erro no parsing da IA:", e);
        }
        if (button) {
            button.disabled = false; button.textContent = "Resolver com IA 🤖";
        }
    }

    function getTextFromHTML(htmlString) {
        if (!htmlString) return "";
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        return tempDiv.textContent || tempDiv.innerText || "";
    }

    // --- FUNÇÕES DE FOCO/OBSERVER (Sem alterações) ---

    function findGuiItemByText(activeText) {
        if (!activeText) return null;
        const cleanActiveText = cleanElementText(activeText);
        const allItems = document.querySelectorAll('.qia-question-item');
        for (const item of allItems) {
            if (item.dataset.questionText === cleanActiveText) { return item; }
        }
        for (const item of allItems) {
            const dataText = item.dataset.questionText;
            if (dataText && cleanActiveText && dataText.startsWith(cleanActiveText)) {
                return item;
            }
        }
        return null;
    }

    function applyFocus(activeText) {
        const allItems = document.querySelectorAll('.qia-question-item');
        const activeItem = findGuiItemByText(activeText);
        allItems.forEach(item => {
            if (item === activeItem) {
                item.style.display = 'block';
                item.classList.add('qia-focused');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.style.display = 'none';
                item.classList.remove('qia-focused');
            }
        });
    }

    function applyHighlight(activeText) {
        const allItems = document.querySelectorAll('.qia-question-item');
        const activeItem = findGuiItemByText(activeText);
        allItems.forEach(item => {
            if (item === activeItem) {
                item.classList.add('qia-focused');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                item.classList.remove('qia-focused');
            }
        });
    }

    function removeFocus() {
        document.querySelectorAll('.qia-question-item').forEach(item => {
            item.style.display = 'block';
            item.classList.remove('qia-focused');
        });
    }

    function startQuestionObserver() {
        if (questionObserver) questionObserver.disconnect();
        const targetNode = document.body;
        if (!targetNode) { console.warn("Não foi possível encontrar o nó 'document.body' para o Observer."); return; }
        const observerConfig = { childList: true, subtree: true, characterData: true };
        const observerCallback = (mutationsList, observer) => {
            const activeQuestionEl = document.querySelector(ACTIVE_QUESTION_SELECTOR);
            if (activeQuestionEl) {
                const newText = cleanElementText(activeQuestionEl.parentElement.textContent);
                if (newText && newText !== currentActiveQuestionText) {
                    currentActiveQuestionText = newText;
                    window.dispatchEvent(new CustomEvent('ActiveQuestionChanged', { detail: currentActiveQuestionText }));
                }
            }
        };
        questionObserver = new MutationObserver(observerCallback);
        questionObserver.observe(targetNode, observerConfig);
    }

    window.addEventListener('ActiveQuestionChanged', (event) => {
        const newText = event.detail;
        if (document.getElementById('qia-focus-toggle')?.checked) {
            applyFocus(newText);
        } else {
            applyHighlight(newText);
        }
    });


    // --- FUNÇÕES DE AUTO-PREENCHIMENTO (v13.24) (Sem alterações) ---

    function waitForElement(selector, timeout = 2000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(interval);
                    reject(new Error(`Elemento "${selector}" não encontrado após ${timeout}ms.`));
                }
            }, 100);
        });
    }

    function cleanElementText(text) {
        if (!text) return "";
        return text.replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim()
                   .replace(/(\.\.\.|\u2026)$/, '')
                   .replace(/\.$/, '')
                   .trim();
    }

    function simulateKeyPress(key) {
        try {
            const keyCode = key.toString().charCodeAt(0);
            const event = new KeyboardEvent('keydown', {
                key: key.toString(),
                code: `Digit${key}`,
                keyCode: keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true
            });
            document.body.dispatchEvent(event);
        } catch (e) {
            console.error("Falha ao simular tecla:", e);
        }
    }

    function findDragDropKeyByText(text) {
        const searchText = cleanElementText(text);
        const elements = document.querySelectorAll('.drag-option.option-highlight');
        for (const el of elements) {
            const textElement = el.querySelector('.dnd-option-text');
            if (textElement && cleanElementText(textElement.textContent) === searchText) {
                const keyElement = el.querySelector('.keyboard-interaction-shortcuts');
                if (keyElement) {
                    return keyElement.textContent.trim();
                }
            }
        }
        console.warn(`[DRAGNDROP] Atalho de teclado para o texto "${text}" não foi encontrado.`);
        return null;
    }

    function findDragDropTargetByIndex(index) {
        const placeholders = document.querySelectorAll('button.drag-and-drop-blank, button.droppable-blank');
        if (placeholders.length > index) {
            return placeholders[index];
        }
        console.warn(`[DRAGNDROP] Alvo no índice ${index} não foi encontrado.`);
        return null;
    }


    function findClickableElementByText(text) {
        const searchText = text.trim();
        const optionElements = document.querySelectorAll('.option-inner, .option');
        for (const el of optionElements) {
            const p = el.querySelector('p');
            if (p) {
                const elementText = cleanElementText(p.textContent);
                if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) {
                    return el;
                }
            }
        }
        console.warn(`Elemento com texto "${text}" não foi encontrado.`);
        return null;
    }

    function findMatchElementByText(text, elementType) {
        const searchText = text.trim();
        const elements = document.querySelectorAll('.match-order-option');
        for (const el of elements) {
            const isDestination = el.classList.contains('is-drop-tile');
            const isSource = el.classList.contains('is-option-tile');
            if ((elementType === 'destination' && !isDestination) || (elementType === 'source' && !isSource)) continue;
            const textElement = el.querySelector('div[id="optionText"]');
            if (textElement) {
                const elementText = cleanElementText(textElement.textContent);
                if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) {
                    return el.querySelector('button.match-order-option-inner') || el;
                }
            }
        }
        console.warn(`[MATCH] Elemento com texto "${text}" (${elementType}) não foi encontrado.`);
        return null;
    }

    function findClassificationElementByText(text) {
        const searchText = text.trim();
        const elements = document.querySelectorAll('.classification-group .cursor-grab');
        for (const el of elements) {
            const textElement = el.querySelector('div[id="optionText"]');
            if (textElement) {
                const elementText = cleanElementText(textElement.textContent);
                if (elementText && (searchText.startsWith(elementText) || elementText.startsWith(searchText))) {
                    return el;
                }
            }
        }
        console.warn(`[CLASSIFICATION] Elemento de origem com texto "${text}" não foi encontrado.`);
        return null;
    }

    function findDropdownPlaceholder(index) {
        const placeholders = document.querySelectorAll('button.options-dropdown');
        if (placeholders.length > index) {
            return placeholders[index];
        }
        console.warn(`[DROPDOWN] Placeholder no índice ${index} não foi encontrado.`);
        return null;
    }

    function findDropdownOption(text) {
        const options = document.querySelectorAll('button.dropdown-option');
        for (const option of options) {
            const textElement = option.querySelector('.resizeable');
            if (textElement && textElement.textContent.trim().includes(text)) {
                return option;
            }
        }
        console.warn(`[DROPDOWN] Opção com texto "${text}" não foi encontrada.`);
        return null;
    }

    async function handleMCQClick(aiResponseText, button) {
        button.disabled = true;
        const answers = aiResponseText.split('\n').filter(Boolean);
        let clickedCount = 0;
        for (const answer of answers) {
            const cleanAnswerText = cleanElementText(answer.substring(answer.indexOf(')') + 1));
            if (!cleanAnswerText) continue;
            const targetElement = findClickableElementByText(cleanAnswerText);
            if (targetElement) {
                targetElement.click();
                clickedCount++;
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        if (clickedCount === answers.length && answers.length > 0) { button.textContent = 'Clicado!'; }
        else if (clickedCount > 0) { button.textContent = `Clicado (${clickedCount}/${answers.length})`; button.style.backgroundColor = '#ffc107'; }
        else { button.textContent = 'Não encontrado!'; button.style.backgroundColor = '#dc3545'; }
    }

    async function handleComplexClick(aiResponseText, kind, button, dataset) {
        button.disabled = true;
        button.textContent = 'Preenchendo...';
        const panel = document.getElementById('qia-panel');
        let pairs = [];

        if (kind === 'MATCH') {
            pairs = aiResponseText.split('\n')
                .filter(line => line.includes('->'))
                .map(line => {
                    const parts = line.split('->');
                    if (parts.length === 2) {
                        const source = cleanElementText(parts[0].replace(/^-/, ''));
                        const destination = cleanElementText(parts[1]);
                        return { source, destination };
                    }
                    return null;
                }).filter(Boolean);
        } else if (kind === 'CLASSIFICATION') {
            const lines = aiResponseText.split('\n').filter(line => line.trim() !== '');
            let currentCategory = '';
            for (const line of lines) {
                if (line.endsWith(':')) currentCategory = cleanElementText(line.slice(0, -1));
                else if (line.startsWith('- ') && currentCategory) pairs.push({ source: cleanElementText(line.substring(2)), destination: currentCategory });
            }
        } else if (kind === 'DROPDOWN' || kind === 'DRAGNDROP') {
            pairs = aiResponseText.split('\n').map(line => {
                 const match = line.match(/^(\d+):\s*(.*)/);
                 if (match) return { index: parseInt(match[1], 10) - 1, text: cleanElementText(match[2]) };
                 return null;
            }).filter(Boolean);
        }

        if (pairs.length === 0) {
            button.textContent = 'Falha ao analisar!'; button.style.backgroundColor = '#dc3545';
            if (panel) panel.classList.remove('qia-minimized');
            return;
        }

        if (panel && !isMasterAutoModeOn) panel.classList.add('qia-minimized');
        await new Promise(resolve => setTimeout(resolve, 400));

        try {
            let successCount = 0;
            if (kind === 'MATCH') {
                for (const pair of pairs) {
                    const sourceEl = findMatchElementByText(pair.source, 'source');
                    if (!sourceEl) { console.error(`Origem não encontrada: "${pair.source}"`); continue; }
                    sourceEl.click(); await new Promise(resolve => setTimeout(resolve, 300));
                    const destEl = findMatchElementByText(pair.destination, 'destination');
                    if (!destEl) { console.error(`Destino não encontrado: "${pair.destination}"`); sourceEl.click(); continue; }
                    destEl.click(); successCount++;
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            } else if (kind === 'CLASSIFICATION') {
                const targets = JSON.parse(decodeURIComponent(dataset.targets)).map(t => cleanElementText(t));
                if (!targets) throw new Error("Categorias de destino não encontradas no dataset.");
                for (const pair of pairs) {
                    const sourceEl = findClassificationElementByText(pair.source);
                    if (!sourceEl) { console.error(`Origem não encontrada: "${pair.source}"`); continue; }
                    sourceEl.click(); await new Promise(resolve => setTimeout(resolve, 300));
                    const destIndex = targets.indexOf(pair.destination);
                    if (destIndex === -1) { console.error(`Destino não encontrado no dataset: "${pair.destination}"`); sourceEl.click(); continue; }
                    const dropzones = document.querySelectorAll('.glowing-dropzone');
                    const destEl = dropzones[destIndex];
                    if (!destEl) { console.error(`Dropzone no índice ${destIndex} não encontrado.`); sourceEl.click(); continue; }
                    destEl.click(); successCount++;
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            } else if (kind === 'DROPDOWN') {
                 for (const item of pairs) {
                    const placeholder = findDropdownPlaceholder(item.index);
                    if (!placeholder) continue;
                    placeholder.click(); await new Promise(resolve => setTimeout(resolve, 500));
                    const option = findDropdownOption(item.text);
                    if (!option) { console.error(`Opção Dropdown não encontrada: "${item.text}"`); continue; }
                    option.click(); successCount++;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } else if (kind === 'DRAGNDROP') {
                 for (const item of pairs) {
                    const targetEl = findDragDropTargetByIndex(item.index);
                    if (!targetEl) { console.error(`[DRAGNDROP] Alvo no índice ${item.index} não foi encontrado.`); continue; }
                    targetEl.click();
                    let keyToPress;
                    try {
                        await waitForElement('.keyboard-interaction-shortcuts', 2000);
                        await new Promise(resolve => setTimeout(resolve, 100));
                        keyToPress = findDragDropKeyByText(item.text);
                    } catch (e) {
                        console.error(`[DRAGNDROP] Pop-up de opções não apareceu.`, e);
                        targetEl.click(); continue;
                    }
                    if (!keyToPress) {
                        console.error(`[DRAGNDROP] Não foi possível encontrar a tecla para "${item.text}"`);
                        targetEl.click(); continue;
                    }
                    simulateKeyPress(keyToPress);
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            }

            button.textContent = `Concluído (${successCount}/${pairs.length})`;
            if (successCount < pairs.length) button.style.backgroundColor = '#ffc107';

        } finally {
            if (panel && !isMasterAutoModeOn) panel.classList.remove('qia-minimized');
        }
    }


    // --- PILOTO AUTOMÁTICO (v13.28) (Sem alterações) ---

    function startMasterLoop() {
        if (masterInterval) clearInterval(masterInterval);
        masterInterval = setInterval(async () => {
            if (isAutoTaskRunning) return;
            isAutoTaskRunning = true;
            try {
                await masterAutoPilotTask();
            } catch (e) {
                console.error("Erro no Piloto Automático:", e);
            }
            isAutoTaskRunning = false;
        }, 750);
    }

    async function masterAutoPilotTask() {
        // 1. Sincroniza o texto da pergunta atual E ATUALIZA O FOCO
        const activeQuestionEl = document.querySelector(ACTIVE_QUESTION_SELECTOR);
        let newText = "";

        if (activeQuestionEl) {
            newText = cleanElementText(activeQuestionEl.parentElement.textContent);
            if (newText && newText !== currentActiveQuestionText) {
                console.log("PA: Nova pergunta detectada:", newText);
                currentActiveQuestionText = newText;
            }
        } else {
            currentActiveQuestionText = "";
        }
        
        // ATUALIZA A GUI (Foco ou Destaque)
        if (document.getElementById('qia-focus-toggle')?.checked) {
            applyFocus(currentActiveQuestionText);
        } else {
            applyHighlight(currentActiveQuestionText);
        }

        // 2. Procura a pergunta atual na GUI
        const activeItem = findGuiItemByText(currentActiveQuestionText);

        // 3. Lógica de Ação
        if (activeItem) {
            // Prioridade 1: Clicar em "Auto-Preencher" (➡️)
            const autoFillBtn = activeItem.querySelector('.qia-autoclick-button[data-processed="false"]');
            if (autoFillBtn) {
                console.log("PA: Clicando em 'Auto-Preencher'...");
                autoFillBtn.click();
                await new Promise(r => setTimeout(r, 1000));
                return;
            }

            // Prioridade 2: Clicar em "Resolver com IA" (🤖)
            const solveBtn = activeItem.querySelector('.qia-ai-button:not([data-processed="true"])');
            if (solveBtn) {
                console.log("PA: Clicando em 'Resolver com IA'...");
                solveBtn.click();
                return;
            }
        }

        // Prioridade 3: Clicar em "Enviar" (Submit)
        const submitBtn = document.querySelector(PA_SUBMIT_BUTTON_SELECTOR);
        if (submitBtn && !submitBtn.disabled) {
            console.log("PA: Clicando em 'Enviar'...");
            submitBtn.click();
            await new Promise(r => setTimeout(r, 1000));
            return;
        }

        // Prioridade 4: Clicar em "Próximo" (Next)
        const nextBtn = document.querySelector(PA_NEXT_BUTTON_SELECTOR);
        if (nextBtn && !nextBtn.disabled) {
            const rect = nextBtn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                console.log("PA: Clicando em 'Próximo'...");
                nextBtn.click();
                await new Promise(r => setTimeout(r, 1000));
                return;
            }
        }
    }

})();
