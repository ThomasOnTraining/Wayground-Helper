// ==UserScript==
// @name         70b - bancoapi
// @namespace    http://tampermonkey.net/
// @version      13.11
// @description  [FIX 9] Separa os prompts de MCQ (exige 1 resposta) e MSQ (permite várias). Corrige o autoclick de MCQ para suportar MSQ.
// @author       @ThomasOnTraining
// @match        *://quizizz.com/*
// @match        *://*.quizizz.com/*
// @match        *://wayground.com/*
// @match        *://*.wayground.com/*
// @connect      api-banco.pintoassado390.workers.dev
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ##################################################################
    // #               URL DO SEU WORKER CONFIGURADA                    #
    // ##################################################################
    const PROXY_URL = "https://api-banco.pintoassado390.workers.dev";
    // ##################################################################


    // --- PARTE 1: INTERCEPTADOR (Sem alterações) ---
    let gameDataHasBeenProcessed = false;
    const originalFetch = window.fetch;
    Object.defineProperty(window, 'fetch', {
        configurable: true, enumerable: true,
        get() {
            return async (...args) => {
                const response = await originalFetch.apply(this, args);
                const [resource] = args;
                const url = (typeof resource === 'string') ? resource : resource.url;
                if (url.includes('/play-api/') && !gameDataHasBeenProcessed) {
                    try {
                        const responseClone = response.clone();
                        const data = await responseClone.json();
                        if (data?.room?.questions && typeof data.room.questions === 'object' && !Array.isArray(data.room.questions)) {
                            gameDataHasBeenProcessed = true;
                            window.dispatchEvent(new CustomEvent('GameDataIntercepted', { detail: data }));
                        }
                    } catch (e) {}
                }
                return response;
            };
        }
    });
    const originalXHR_open=XMLHttpRequest.prototype.open;const originalXHR_send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(...e){return this._requestURL=e[1],originalXHR_open.apply(this,e)};XMLHttpRequest.prototype.send=function(...e){return this.addEventListener("load",function(){if(this._requestURL&&this._requestURL.includes("/play-api/")&&!gameDataHasBeenProcessed)try{const e=JSON.parse(this.responseText);e?.room?.questions&&"object"==typeof e.room.questions&&!Array.isArray(e.room.questions)&&(gameDataHasBeenProcessed=!0,window.dispatchEvent(new CustomEvent("GameDataIntercepted",{detail:e})))}catch(e){}}),originalXHR_send.apply(this,e)};

    // --- PARTE 2: GUI (Simplificada - remoção das Configurações) ---
    let isGUIReady = false;
    let gameDataForGUI = null;

    window.addEventListener('GameDataIntercepted', function(event) {
        gameDataForGUI = event.detail;
        if (isGUIReady) {
            populateGUI(gameDataForGUI.room.questions);
        }
    });

    function createGUI() {
        isGUIReady = true;
        const styles = `
            #qia-panel { position: fixed; top: 20px; right: 20px; width: 380px; max-height: 90vh; background-color: #ffffff;
                border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                font-family: Arial, sans-serif; z-index: 99999; display: flex; flex-direction: column;
                transition: transform 0.3s ease, opacity 0.3s ease; transform-origin: top right; }
            #qia-panel.qia-minimized { transform: scale(0); opacity: 0; pointer-events: none; }
            #qia-header { padding: 10px 15px; background-color: #f5f5f5; border-bottom: 1px solid #e0e0e0; cursor: move;
                display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 12px; border-top-right-radius: 12px; }
            #qia-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
            #qia-controls button { background: none; border: none; cursor: pointer; font-size: 20px; margin-left: 10px; opacity: 0.7; }
            #qia-controls button:hover { opacity: 1; }
            #qia-content { padding: 15px; overflow-y: auto; flex-grow: 1; }
            .qia-question-item { margin-bottom: 15px; padding: 10px; border: 1px solid #eee; border-radius: 8px; }
            .qia-question-item p { margin: 5px 0; color: #111; }
            .qia-question-text { font-weight: bold; }
            .qia-options-list { list-style: none; padding-left: 15px; font-size: 14px; color: #333; }
            .qia-options-list b { font-weight: 600; }
            .qia-ai-button { cursor: pointer; padding: 4px 10px; border: 1px solid #ccc; border-radius: 5px; background-color: #f0f0f0; margin-top: 10px; font-size: 12px; }
            .qia-ai-button:disabled { cursor: not-allowed; opacity: 0.5; }
            .qia-ai-response { margin-top: 8px; padding: 8px; border-left: 3px solid #4285F4; background-color: #e8f0fe; font-size: 14px; white-space: pre-wrap; font-weight: bold; color: #174ea6;}
            .qia-autoclick-button { cursor: pointer; padding: 4px 10px; border: 1px solid #28a745; border-radius: 5px; background-color: #28a745; color: white; margin-top: 8px; margin-left: 5px; font-size: 12px; }
            .qia-autoclick-button:disabled { background-color: #ccc; border-color: #ccc; cursor: not-allowed; }
        `;
        const styleSheet = document.createElement("style"); styleSheet.innerText = styles; document.head.appendChild(styleSheet);
        // HTML do painel SIMPLIFICADO (sem botão de settings, sem div de settings)
        const panelHTML = `<div id="qia-header"><h3>🧠 Assistente IA (Groq)</h3><div id="qia-controls"><button id="qia-minimize-btn" title="Minimizar">➖</button></div></div><div id="qia-content"><p>Aguardando o início do jogo...</p></div>`;
        const panel = document.createElement("div"); panel.id = "qia-panel"; panel.innerHTML = panelHTML; document.body.appendChild(panel);

        // Lógica de arrastar (Sem alterações)
        const qiaPanel=document.getElementById('qia-panel'),header=document.getElementById('qia-header');let isDragging=!1,offset={x:0,y:0};header.addEventListener('mousedown',e=>{isDragging=!0,offset.x=e.clientX-qiaPanel.offsetLeft,offset.y=e.clientY-qiaPanel.offsetTop}),document.addEventListener('mousemove',e=>{isDragging&&(qiaPanel.style.left=`${e.clientX-offset.x}px`,qiaPanel.style.top=`${e.clientY-offset.y}px`)}),document.addEventListener('mouseup',()=>isDragging=!1),document.getElementById('qia-minimize-btn').addEventListener('click',()=>qiaPanel.classList.toggle('qia-minimized'));

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
                case 'REORDER':
                    questionHTML = `<p class="qia-question-text">${questionText} (Tipo: ${questionKind})</p>`;
                    const reorderOptions = questionInfo.structure.options.map(o => getTextFromHTML(o.text));
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

    // --- PARTE 3: LÓGICA DA IA (Modificada para usar o Proxy) ---

    function handleSolveClick(event) {
        const button = event.target;
        const responseDiv = button.nextElementSibling;
        const oldAutoClickBtn = button.parentElement.querySelector('.qia-autoclick-button');
        if (oldAutoClickBtn) oldAutoClickBtn.remove();

        button.disabled = true; button.textContent = "Pensando...";
        responseDiv.style.display = 'block'; responseDiv.textContent = 'Analisando...';

        buildPromptAndCallAI(button.dataset, responseDiv, button);
    }

    function buildPromptAndCallAI(dataset, responseDiv, button) {
        const { kind, question } = dataset;
        let prompt = '';

        // ----- PROMPTS (Sem alterações) -----
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
            case 'REORDER':
                const reorderOptions = JSON.parse(decodeURIComponent(dataset.options));
                prompt = `Analise a seguinte pergunta de ordenação. Sua tarefa é colocar a lista de "Itens para Ordenar" na sequência correta. Responda APENAS com uma lista numerada, começando em 1, na ordem correta. NÃO inclua nenhuma introdução, observação ou texto explicativo.\n\nPergunta:\n"${decodeURIComponent(question)}"\n\nItens para Ordenar:\n- ${reorderOptions.join('\n- ')}`;
                break;
        }
        // ----------------------------------------------------

        performProxyRequest(prompt, responseDiv, button, dataset);
    }

    /**
     * Função que faz a requisição ao SEU SERVIDOR PROXY.
     */
    function performProxyRequest(prompt, responseDiv, button, dataset) {

        GM_xmlhttpRequest({
            method: 'POST',
            url: PROXY_URL, // <--- Conecta ao seu servidor
            headers: {
                'Content-Type': 'application/json',
                // <--- Nenhuma chave de API é enviada daqui
            },
            data: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }]
            }),
            onload: function(response) {
                // Erro (Ex: 429 - todas as chaves em cooldown)
                if (response.status !== 200) {
                    try {
                        const errorData = JSON.parse(response.responseText);
                        responseDiv.textContent = `Erro do Proxy: ${errorData?.error || 'Erro desconhecido'}`;
                    } catch (e) {
                         responseDiv.textContent = `Erro: ${response.status}. O proxy não respondeu corretamente.`;
                    }
                    button.disabled = false; button.textContent = "Resolver com IA 🤖";
                }
                // Sucesso
                else {
                    handleAISuccess(response.responseText, responseDiv, button, dataset);
                }
            },
            onerror: (error) => {
                responseDiv.textContent = 'Erro de rede. Não foi possível conectar ao proxy.';
                button.disabled = false; button.textContent = "Resolver com IA 🤖";
                console.error("Erro na requisição para o Proxy:", error);
            }
        });
    }

    /**
     * Processa uma resposta de IA bem-sucedida (Sem alterações)
     */
    function handleAISuccess(responseText, responseDiv, button, dataset) {
         try {
            const responseData = JSON.parse(responseText);
            const aiResponseText = responseData.choices?.[0]?.message?.content;
            if (aiResponseText) {
                responseDiv.innerHTML = "✔️<br>" + aiResponseText.replace(/\n/g, '<br>');

                const autoButton = document.createElement('button');
                autoButton.className = 'qia-autoclick-button';
                responseDiv.appendChild(autoButton);

                const kind = dataset.kind;
                if (kind === 'MCQ' || kind === 'MSQ') {
                    autoButton.textContent = '➡️ Clicar na Resposta';
                    autoButton.addEventListener('click', () => handleMCQClick(aiResponseText, autoButton));
                } else if (kind === 'MATCH' || kind === 'CLASSIFICATION' || kind === 'DROPDOWN') {
                    autoButton.textContent = '➡️ Auto-Preencher';
                    autoButton.addEventListener('click', () => handleComplexClick(aiResponseText, kind, autoButton, dataset));
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
        button.disabled = false; button.textContent = "Resolver com IA 🤖";
    }

    function getTextFromHTML(htmlString) {
        if (!htmlString) return "";
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        return tempDiv.textContent.trim() || tempDiv.innerText.trim() || "";
    }

    // --- FUNÇÕES DE AUTO-PREENCHIMENTO (handleMCQClick modificada) ---

    function cleanElementText(text) {
        if (!text) return "";
        return text.trim().replace(/(\.\.\.|\u2026)$/, '').replace(/\.$/, '').trim();
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

    // ----- MODIFICADO: Função agora é async e clica em MÚLTIPLAS respostas (para MSQ) -----
    async function handleMCQClick(aiResponseText, button) {
        button.disabled = true;

        const answers = aiResponseText.split('\n').filter(Boolean); // Divide por linha, remove linhas vazias
        let clickedCount = 0;

        for (const answer of answers) {
            const cleanAnswerText = answer.substring(answer.indexOf(')') + 1).trim();
            if (!cleanAnswerText) continue; // Pula linhas mal formatadas

            const targetElement = findClickableElementByText(cleanAnswerText);
            if (targetElement) {
                targetElement.click();
                clickedCount++;
                await new Promise(resolve => setTimeout(resolve, 300)); // Pequena pausa entre cliques
            }
        }

        if (clickedCount === answers.length && answers.length > 0) {
            button.textContent = 'Clicado!';
        } else if (clickedCount > 0) {
            button.textContent = `Clicado (${clickedCount}/${answers.length})`;
            button.style.backgroundColor = '#ffc107'; // Amarelo
        } else {
            button.textContent = 'Não encontrado!';
            button.style.backgroundColor = '#dc3545'; // Vermelho
        }
    }
    // ---------------------------------------------------------------------------------

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
                        const source = parts[0].replace(/^-/, '').trim();
                        const destination = parts[1].trim();
                        return { source, destination };
                    }
                    return null;
                }).filter(Boolean);
        } else if (kind === 'CLASSIFICATION') {
            const lines = aiResponseText.split('\n').filter(line => line.trim() !== '');
            let currentCategory = '';
            for (const line of lines) {
                if (line.endsWith(':')) currentCategory = line.slice(0, -1).trim();
                else if (line.startsWith('- ') && currentCategory) pairs.push({ source: line.substring(2).trim(), destination: currentCategory });
            }
        } else if (kind === 'DROPDOWN') {
            pairs = aiResponseText.split('\n').map(line => {
                 const match = line.match(/^(\d+):\s*(.*)/);
                 if (match) return { index: parseInt(match[1], 10) - 1, text: match[2].trim() };
                 return null;
            }).filter(Boolean);
        }


        if (pairs.length === 0) {
            button.textContent = 'Falha ao analisar!';
            button.style.backgroundColor = '#dc3545';
            if (panel) panel.classList.remove('qia-minimized');
            return;
        }

        if (panel) panel.classList.add('qia-minimized');
        await new Promise(resolve => setTimeout(resolve, 400));

        try {
            let successCount = 0;
            if (kind === 'MATCH') {
                for (const pair of pairs) {
                    const sourceEl = findMatchElementByText(pair.source, 'source');
                    if (!sourceEl) { console.error(`Origem não encontrada: "${pair.source}"`); continue; }
                    sourceEl.click();
                    await new Promise(resolve => setTimeout(resolve, 300));

                    const destEl = findMatchElementByText(pair.destination, 'destination');
                    if (!destEl) { console.error(`Destino não encontrado: "${pair.destination}"`); sourceEl.click(); continue; }

                    destEl.click();
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            } else if (kind === 'CLASSIFICATION') {
                const targets = JSON.parse(decodeURIComponent(dataset.targets));
                if (!targets) throw new Error("Categorias de destino não encontradas no dataset.");
                for (const pair of pairs) {
                    const sourceEl = findClassificationElementByText(pair.source);
                    if (!sourceEl) { console.error(`Origem não encontrada: "${pair.source}"`); continue; }
                    sourceEl.click();
                    await new Promise(resolve => setTimeout(resolve, 300));

                    const destIndex = targets.indexOf(pair.destination);
                    if (destIndex === -1) { console.error(`Destino não encontrado no dataset: "${pair.destination}"`); sourceEl.click(); continue; }

                    const dropzones = document.querySelectorAll('.glowing-dropzone');
                    const destEl = dropzones[destIndex];
                    if (!destEl) { console.error(`Dropzone no índice ${destIndex} não encontrado.`); sourceEl.click(); continue; }

                    destEl.click();
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
            } else if (kind === 'DROPDOWN') {
                 for (const item of pairs) {
                    const placeholder = findDropdownPlaceholder(item.index);
                    if (!placeholder) continue;
                    placeholder.click();
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const option = findDropdownOption(item.text);
                    if (!option) { console.error(`Opção Dropdown não encontrada: "${item.text}"`); continue; }

                    option.click();
                    successCount++;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            button.textContent = `Concluído (${successCount}/${pairs.length})`;
            if (successCount < pairs.length) button.style.backgroundColor = '#ffc107';

        } finally {
            if (panel) panel.classList.remove('qia-minimized');
        }
    }

})();