// ############## IMPORTANTE ##############
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbwhsTtOPvSFBzi86nlSaW8a4QHD-UmBD46ZJdy7yUnyLwjOl4q9fyulxBa4-vNRaxjm/exec';
const WHATSAPP_NUMBER = '44998408460';
// ########################################

let currentScreen = 1;
const appData = {
    client: { name: '', cpf: '' },
    order: {
        currentDate: '', paymentDate: '', firstInstallmentDate: '',
        daysToFirstInstallment: 0, lastInstallmentDate: ''
    },
    products: [],
    baseTotalAmount: 0,
    entry: {
        type: 'none', // 'none', '10', '20', '30', 'custom'
        percentageForFixed: 0,
        customAmountRaw: 0,
        calculatedAmount: 0,
        effectivePercentage: 0
    },
    warranty: { type: 'none', percentageValue: 0 },
    financing: {
        amountForInstallmentCalculation: 0,
        selectedInstallment: null,
        // NOVAS TAXAS DE MARKUP TOTAL PARA 3X E 48X POR FAIXA DE ENTRADA
        // A taxa para parcelas entre 3x e 48x será INTERPOLADA LINEARMENTE entre rate3x e rate48x
        interestSettings: {
            noEntry:    { rate3x: 0.17, rate48x: 0.10 }, // Sem entrada (< 10%)
            entry10pct: { rate3x: 0.15, rate48x: 0.09 }, // Entrada 10% a < 20%
            entry20pct: { rate3x: 0.14, rate48x: 0.08 }, // Entrada 20% a < 30%
            entry30pct: { rate3x: 0.13, rate48x: 0.07 }, // Entrada 30% a < 40%
            entry40pct: { rate3x: 0.12, rate48x: 0.06 }, // Entrada 40% a < 50%
            entry50plus: { rate3x: 0.11, rate48x: 0.05 } // Entrada 50%+
        },
        currentRates: {} // Armazena o par {rate3x, rate48x} da faixa de entrada atual
    },
    feedbackMessage: ''
};

function roundUpToNearest5(num) {
    if (num <= 0) return 0;
    // Garante que o arredondamento para cima considere a casa decimal correta
    return Math.ceil((num + Number.EPSILON) / 5) * 5;
}

document.addEventListener('DOMContentLoaded', () => {
    showScreen(1);
    updateProgressBar(1);
    initializeScreen1();
    const cpfInput = document.getElementById('clientCpf');
    if (cpfInput) cpfInput.addEventListener('input', maskCPF);
    const customEntryInput = document.getElementById('customEntryAmountInput');
    if(customEntryInput) customEntryInput.addEventListener('input', handleCustomEntryValueChange);
});

function initializeScreen1() {
    const today = new Date();
    appData.order.currentDate = formatDateForDisplay(formatDateForInput(today));
    document.getElementById('currentDate').textContent = appData.order.currentDate;
    generatePaymentDayOptions(); // Gera as opções de dia
    
    // Reseta os campos da tela 1
    document.getElementById('clientName').value = appData.client.name; // Mantém se já houver (no caso de restart)
    document.getElementById('clientCpf').value = appData.client.cpf;   // Mantém se já houver

    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    const firstInstallmentDateSpan = document.getElementById('firstInstallmentDateInfo');
    const daysToFirstInstallmentSpan = document.getElementById('daysToFirstInstallment');
    
    // Limpa seleção de data visual e dados
    appData.order.paymentDate = '';
    appData.order.firstInstallmentDate = '';
    appData.order.daysToFirstInstallment = 0;
    document.getElementById('selectedPaymentDateHidden').value = '';
    document.querySelectorAll('#paymentDayOptionsContainer .option-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false);


    if (firstInstallmentDateSpan) firstInstallmentDateSpan.textContent = 'A definir';
    if (daysToFirstInstallmentSpan) daysToFirstInstallmentSpan.textContent = 'A definir';
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none';
    
    checkScreen1Completion(); // Verifica se o botão deve estar habilitado
}


function generatePaymentDayOptions() {
    const container = document.getElementById('paymentDayOptionsContainer');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date(); // Data local para referência de 'hoje'
    const currentDayUTC = today.getUTCDate();
    const currentMonthUTC = today.getUTCMonth();
    const currentYearUTC = today.getUTCFullYear();
    
    // Calcula a data limite (hoje + 33 dias) em UTC
    const limitDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 33)); // LIMITE DE 33 DIAS

    const fixedDays = [5, 10, 15, 20, 25, 30];
    let optionsGenerated = 0;
    const addedDates = new Set();

    for (let monthOffset = 0; monthOffset < 2 && optionsGenerated < 8; monthOffset++) { // Tenta mês atual e próximo
        const targetMonth = currentMonthUTC + monthOffset;
        const year = currentYearUTC + Math.floor(targetMonth / 12);
        const month = targetMonth % 12;

        fixedDays.forEach(day => {
            if (optionsGenerated >= 8) return;
            
            const paymentDateAttempt = new Date(Date.UTC(year, month, day));
            
            if (paymentDateAttempt.getUTCDate() !== day) { // Evita dias inválidos para o mês
                return; 
            }

            // Data mínima selecionável é amanhã (em UTC)
            const minSelectableDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 1));

            // Verifica se a data está dentro do range permitido (amanhã até limiteDate)
            if (paymentDateAttempt.getTime() >= minSelectableDate.getTime() && 
                paymentDateAttempt.getTime() <= limitDate.getTime()) { // NOVA VERIFICAÇÃO DE LIMITE
                
                const dateStr = formatDateForInput(paymentDateAttempt);
                if (addedDates.has(dateStr)) return;
                addedDates.add(dateStr);

                const optionDiv = document.createElement('div');
                optionDiv.classList.add('option-item');
                optionDiv.innerHTML = `<input type="radio" name="paymentDay" id="dayOpt${dateStr}" value="${dateStr}">
                                       <label for="dayOpt${dateStr}">${formatDateForDisplay(dateStr)}</label>`;
                optionDiv.onclick = () => selectPaymentDate(dateStr, optionDiv);
                container.appendChild(optionDiv);
                optionsGenerated++;
            }
        });
    }
}

function selectPaymentDate(dateStr, element) {
    document.querySelectorAll('#paymentDayOptionsContainer .option-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    const radio = element.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;

    document.getElementById('selectedPaymentDateHidden').value = dateStr;
    appData.order.paymentDate = dateStr;
    appData.order.firstInstallmentDate = dateStr;

    document.getElementById('firstInstallmentDateInfo').textContent = formatDateForDisplay(dateStr);
    
    // Calcula os dias de hoje (UTC) até a data de pagamento (UTC)
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const paymentDParts = dateStr.split('-');
    const paymentD = new Date(Date.UTC(parseInt(paymentDParts[0]), parseInt(paymentDParts[1])-1, parseInt(paymentDParts[2])));
    
    const diffTime = paymentD.getTime() - today.getTime();
    // Arredonda para cima, garantindo pelo menos 0 dias
    appData.order.daysToFirstInstallment = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    document.getElementById('daysToFirstInstallment').textContent = `${appData.order.daysToFirstInstallment} dia(s)`;
    document.getElementById('paymentDateDetails').style.display = 'block';
    checkScreen1Completion();
}

function maskCPF(event) { 
    let cpf = event.target.value.replace(/\D/g, ''); 
    if (cpf.length > 11) cpf = cpf.substring(0, 11);
    let maskedCpf = '';
    if (cpf.length <= 3) maskedCpf = cpf;
    else if (cpf.length <= 6) maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3)}`;
    else if (cpf.length <= 9) maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6)}`;
    else maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-${cpf.substring(9)}`;
    event.target.value = maskedCpf;
    appData.client.cpf = maskedCpf;
    checkScreen1Completion();
}

function checkScreen1Completion() {
    const name = document.getElementById('clientName').value.trim();
    const cpf = appData.client.cpf; // Usa o valor armazenado com máscara
    const paymentDate = appData.order.paymentDate;
    document.getElementById('btnNext1').disabled = !(name && cpf && cpf.length === 14 && paymentDate);
}

function formatDateForInput(date) { // Recebe objeto Date (assumido como local, mas convertendo para YYYY-MM-DD em UTC)
    // Para garantir consistência com UTC usado em cálculos de datas
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) { // Recebe string YYYY-MM-DD
    if (!dateString) return 'N/A';
    const dateParts = dateString.split('-');
    if (dateParts.length === 3) {
        // Cria data em UTC para consistência, já que formatDateForInput usa UTC
        const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }
    return dateString;
}

function showScreen(screenNumber) {
    document.querySelectorAll('.screen').forEach(screen => screen.style.display = 'none');
    const nextScreenElement = document.getElementById(`screen${screenNumber}`);
    if (nextScreenElement) nextScreenElement.style.display = 'block';
    currentScreen = screenNumber;
    updateProgressBar(screenNumber);
}

function updateProgressBar(screenNumber) {
    const totalSteps = 5;
    for (let i = 1; i <= totalSteps; i++) {
        const step = document.getElementById(`step${i}`);
        if (!step) continue;
        step.classList.remove('active', 'completed');
        step.textContent = i;
        if (i < screenNumber) { step.classList.add('completed'); step.textContent = '✓'; }
        else if (i === screenNumber) { step.classList.add('active'); }
    }
}

function nextScreen(currentScreenNum) {
    if (!validateScreen(currentScreenNum)) return;

    if (currentScreenNum === 1) {
        appData.client.name = document.getElementById('clientName').value.trim();
        document.getElementById('btnNext2').disabled = appData.products.length === 0;
    } else if (currentScreenNum === 2) {
        updateEntryPlaceholders(); // Atualiza R$ das entradas de % na tela 3
        document.getElementById('btnNext3').disabled = false; 
        const entryResultInfoBox = document.getElementById('entryResultInfoBox');
        // Só mostra a caixa de info da entrada se uma opção de entrada já foi selecionada (ou é 'none')
        if (appData.entry.type !== '' && entryResultInfoBox) entryResultInfoBox.style.display = 'block'; 
        else if (entryResultInfoBox) entryResultInfoBox.style.display = 'none';
    } else if (currentScreenNum === 3) {
        updateAllCalculationsAndUI();
        document.getElementById('btnNext4').disabled = !appData.financing.selectedInstallment && appData.financing.amountForInstallmentCalculation > 0; // Desabilita se não selecionou e precisa financiar
        if (appData.financing.amountForInstallmentCalculation <= 0 && appData.baseTotalAmount > 0) { // Habilita se não precisa financiar
             document.getElementById('btnNext4').disabled = false;
        } else if (appData.baseTotalAmount === 0) { // Desabilita se não tem produto
             document.getElementById('btnNext4').disabled = true;
        }
    } else if (currentScreenNum === 4) {
        prepareSummaryAndWhatsApp();
    }

    if (currentScreenNum < 5) showScreen(currentScreenNum + 1);
}

function prevScreen(currentScreenNum) {
    if (currentScreenNum > 1) showScreen(currentScreenNum - 1);
}

function validateScreen(screenNumber) {
    if (screenNumber === 1) { 
        if (!appData.client.name || !appData.client.cpf || appData.client.cpf.length !== 14 || !appData.order.paymentDate) {
            alert("Por favor, preencha Nome, CPF e selecione uma Data de Pagamento.");
            return false;
        }
    }
    if (screenNumber === 2) {
        if (appData.products.length === 0) { alert('Adicione pelo menos um produto.'); return false; }
    }
     if (screenNumber === 3) {
        const totalWithWarranty = appData.baseTotalAmount * (1 + appData.warranty.percentageValue); 
         if (appData.entry.type === 'custom' && appData.entry.calculatedAmount > totalWithWarranty && totalWithWarranty > 0) {
             // alert('A entrada personalizada não pode ser maior que o valor total dos produtos (com garantia se aplicável).');
             // Não impede, apenas ajusta o valor calculado na updateAllCalculationsAndUI
         }
         // Revalidar aqui se necessário, mas a lógica de cálculo já ajusta.
    }
    if (screenNumber === 4) {
        // Só exige seleção de parcela se houver valor a financiar > 0
        if (appData.financing.amountForInstallmentCalculation > 0 && !appData.financing.selectedInstallment) {
            alert('Selecione uma opção de parcelamento.'); return false;
        }
         if (appData.baseTotalAmount === 0) {
            alert('Adicione produtos na Tela 2 primeiro.'); return false; // Não deveria chegar aqui, mas garante.
         }
    }
    return true;
}

async function fetchProductBySku() {
    const skuInput = document.getElementById('productSku');
    const sku = skuInput.value.trim().toUpperCase();
    const displayDiv = document.getElementById('productFetchDisplay');
    const nameDisplay = document.getElementById('fetchedProductNameDisplay');
    const priceDisplay = document.getElementById('fetchedProductPriceDisplay');
    const nameHidden = document.getElementById('productNameHidden');
    const valueHidden = document.getElementById('productValueHidden');
    const btnAdd = document.getElementById('btnAddProductToList');
    const btnFetch = document.getElementById('btnFetchProduct');

    if (!sku) { alert('Insira um SKU.'); return; }
    btnFetch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
    btnFetch.disabled = true; displayDiv.style.display = 'none'; btnAdd.disabled = true;

    try {
        const response = await fetch(`${GOOGLE_SHEET_API_URL}?sku=${encodeURIComponent(sku)}`);
        if (!response.ok) {
            let err; try { err = await response.json(); } catch (e) {}
            throw new Error( (err && err.error) ? `API: ${err.error}` : `HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data.found) {
            nameDisplay.textContent = data.name; priceDisplay.textContent = `R$ ${parseFloat(data.price).toFixed(2)}`;
            nameHidden.value = data.name; valueHidden.value = parseFloat(data.price);
            displayDiv.style.display = 'block'; btnAdd.disabled = false;
        } else { alert(data.error || `SKU "${sku}" não encontrado.`); }
    } catch (error) { console.error('Busca SKU:', error); alert(`Erro: ${error.message}`);
    } finally { btnFetch.innerHTML = '<i class="fas fa-search"></i> Buscar'; btnFetch.disabled = false; }
}

function addProductToListAndClearSearch() {
    const name = document.getElementById('productNameHidden').value;
    const value = parseFloat(document.getElementById('productValueHidden').value);
    const addedMessage = document.getElementById('productAddedMessage');

    if (name && !isNaN(value) && value > 0) {
        appData.products.push({ id: Date.now(), name, value });
        updateProductVisor();
        document.getElementById('productSku').value = '';
        document.getElementById('productFetchDisplay').style.display = 'none';
        document.getElementById('btnAddProductToList').disabled = true;
        if(addedMessage) {
            addedMessage.style.display = 'block';
            setTimeout(() => { addedMessage.style.display = 'none'; }, 2000);
        }
    } else { alert('Produto inválido para adicionar.'); }
}

function updateProductVisor() {
    const visor = document.getElementById('productsAddedVisor');
    const totalDisplay = document.getElementById('totalProductsAmountVisor');
    visor.innerHTML = ''; appData.baseTotalAmount = 0;

    if (appData.products.length === 0) {
        visor.innerHTML = '<p>Nenhum produto adicionado.</p>';
        document.getElementById('btnNext2').disabled = true;
    } else {
        appData.products.forEach((p, index) => {
            appData.baseTotalAmount += p.value;
            const item = document.createElement('div'); item.classList.add('product-item-visor');
            item.innerHTML = `<span class="product-name">${p.name}</span> <span class="product-price">R$ ${p.value.toFixed(2)}</span>
                              <button class="remove-product-visor" onclick="removeProductFromVisor(${index})" title="Remover"><i class="fas fa-times-circle"></i></button>`;
            visor.appendChild(item);
        });
        document.getElementById('btnNext2').disabled = false;
    }
    totalDisplay.textContent = appData.baseTotalAmount.toFixed(2);
    updateEntryPlaceholders();
    updateAllCalculationsAndUI(); // Recalcula tudo quando os produtos mudam
}

function removeProductFromVisor(index) {
    appData.products.splice(index, 1);
    updateProductVisor(); // Atualiza o visor e recalcula tudo
}

function updateEntryPlaceholders() {
    const totalValueForPlaceholders = appData.baseTotalAmount * (1 + appData.warranty.percentageValue); // Placeholders baseados no total + garantia
    document.querySelectorAll('.entry-value-placeholder').forEach(span => {
        const pct = parseFloat(span.dataset.pct);
        if (!isNaN(pct)) {
            // Mostra o valor arredondado, mas o cálculo real usa o totalWithWarrantyEffect
            span.textContent = `R$ ${roundUpToNearest5(totalValueForPlaceholders * pct).toFixed(2)}`;
        }
    });
}

function selectEntryOption(type, element) {
    appData.entry.type = type;
    const customGroup = document.getElementById('customEntryValueGroup');
    const customInput = document.getElementById('customEntryAmountInput');
    const entryResultInfoBox = document.getElementById('entryResultInfoBox');

    document.querySelectorAll('.entry-options .option-item').forEach(el => el.classList.remove('selected'));
    if (element) {
        element.classList.add('selected');
        const radio = element.querySelector('input[type="radio"]');
        if(radio) radio.checked = true;
    } else { // Caso element seja nulo (e.g., reiniciando)
         document.querySelector(`input[name="entryOption"][value="${type}"]`).checked = true;
         const correspondingElement = document.querySelector(`.entry-options .option-item input[value="${type}"]`).closest('.option-item');
         if (correspondingElement) correspondingElement.classList.add('selected');
    }


    if (type === 'custom') {
        customGroup.style.display = 'block';
        // Não limpa o valor aqui, mantém o último digitado ou 0
        customInput.value = appData.entry.customAmountRaw > 0 ? appData.entry.customAmountRaw.toFixed(2) : '';
        // Recalcula se houver valor bruto ou se for 0
        handleCustomEntryValueChange(); 
    } else {
        customGroup.style.display = 'none';
        appData.entry.customAmountRaw = 0; // Reseta valor bruto custom se mudar
        appData.entry.percentageForFixed = (type === 'none') ? 0 : parseInt(type) / 100;
        updateAllCalculationsAndUI();
    }
    if (entryResultInfoBox) {
         // Só mostra a caixa se não for 'none' ou se for 'custom' e houver valor calculado > 0
        if (type !== 'none' || (type === 'custom' && appData.entry.calculatedAmount > 0)) {
             entryResultInfoBox.style.display = 'block';
        } else {
             entryResultInfoBox.style.display = 'none';
        }
    }
}

function handleCustomEntryValueChange() {
    if (appData.entry.type === 'custom') {
        // Remove máscara de moeda se houver, mantém apenas números e um ponto/vírgula
        let rawValue = document.getElementById('customEntryAmountInput').value
            .replace(/\D/g, ''); // Remove tudo que não é dígito
        // Trata o caso de vírgula como separador decimal
        if (rawValue.length > 2) {
             rawValue = rawValue.slice(0, -2) + '.' + rawValue.slice(-2);
        } else if (rawValue.length === 2) {
             rawValue = '0.' + rawValue;
        } else if (rawValue.length === 1) {
             rawValue = '0.0' + rawValue;
        } else {
             rawValue = '0';
        }

        appData.entry.customAmountRaw = parseFloat(rawValue) || 0;
        // Atualiza o campo com o valor formatado (opcional, mas melhora UX)
         document.getElementById('customEntryAmountInput').value = appData.entry.customAmountRaw > 0 ? appData.entry.customAmountRaw.toFixed(2) : '';

        updateAllCalculationsAndUI();
         const entryResultInfoBox = document.getElementById('entryResultInfoBox');
         if(entryResultInfoBox) {
             if (appData.entry.calculatedAmount > 0) {
                  entryResultInfoBox.style.display = 'block';
             } else {
                  entryResultInfoBox.style.display = 'none';
             }
         }
    }
}


function selectWarrantyOption(type, element) {
    appData.warranty.type = type;
    const percentages = {'none':0, '6':0.05, '12':0.10, '18':0.15, '24':0.20};
    appData.warranty.percentageValue = percentages[type] || 0;

    document.querySelectorAll('.warranty-options .option-item').forEach(el => el.classList.remove('selected'));
    if (element) {
        element.classList.add('selected');
        const radio = element.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
    } else { // Caso element seja nulo (e.g., reiniciando)
         document.querySelector(`input[name="warrantyOption"][value="${type}"]`).checked = true;
         const correspondingElement = document.querySelector(`.warranty-options .option-item input[value="${type}"]`).closest('.option-item');
         if (correspondingElement) correspondingElement.classList.add('selected');
    }

    updateAllCalculationsAndUI();
    // Re-renderiza placeholders de entrada, pois o total base pode ter mudado
     updateEntryPlaceholders();
}

function updateAllCalculationsAndUI() {
    const totalWithWarrantyEffect = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);

    // --- Cálculo da Entrada ---
    if (appData.entry.type === 'custom') {
        appData.entry.calculatedAmount = roundUpToNearest5(appData.entry.customAmountRaw);
        // Garante que a entrada calculada não exceda o total base + garantia
        if (appData.entry.calculatedAmount > totalWithWarrantyEffect && totalWithWarrantyEffect > 0) {
            appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect);
            // Atualiza o campo de input custom se o valor foi ajustado
            const customInput = document.getElementById('customEntryAmountInput');
            if (customInput && parseFloat(customInput.value) !== appData.entry.calculatedAmount) {
                 customInput.value = appData.entry.calculatedAmount.toFixed(2);
            }
        } else if (totalWithWarrantyEffect === 0) {
            appData.entry.calculatedAmount = 0; // Se o total é zero, a entrada é zero
        }
    } else if (appData.entry.type !== 'none') { // '10', '20', '30'
        appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect * appData.entry.percentageForFixed);
    } else { // 'none'
        appData.entry.calculatedAmount = 0;
    }
    
    // Garante que a entrada calculada nunca seja maior que o total com garantia (mesmo após arredondamento)
    if (totalWithWarrantyEffect > 0 && appData.entry.calculatedAmount > totalWithWarrantyEffect) {
         appData.entry.calculatedAmount = totalWithWarrantyEffect;
    }


    appData.entry.effectivePercentage = totalWithWarrantyEffect > 0 ? (appData.entry.calculatedAmount / totalWithWarrantyEffect) : 0;

    document.getElementById('finalEntryValueDisplay').textContent = appData.entry.calculatedAmount.toFixed(2);
    appData.financing.amountForInstallmentCalculation = totalWithWarrantyEffect - appData.entry.calculatedAmount;
    if (appData.financing.amountForInstallmentCalculation < 0) appData.financing.amountForInstallmentCalculation = 0; // Garante que não seja negativo
    document.getElementById('finalAmountToFinanceDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);

    // --- Seleção da Faixa de Juros com base na Entrada Efetiva ---
    const p = appData.entry.effectivePercentage; // Já é um valor entre 0 e 1
    const rates = appData.financing.interestSettings;
    
    if (p < 0.10) appData.financing.currentRates = rates.noEntry;
    else if (p < 0.20) appData.financing.currentRates = rates.entry10pct;
    else if (p < 0.30) appData.financing.currentRates = rates.entry20pct;
    else if (p < 0.40) appData.financing.currentRates = rates.entry30pct;
    else if (p < 0.50) appData.financing.currentRates = rates.entry40pct;
    else appData.financing.currentRates = rates.entry50plus; // 50% ou mais

    document.getElementById('installmentCalculationBaseDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);

    // Reinicia a seleção de parcela se o valor a financiar mudou significativamente
    // ou se a faixa de juros mudou
    const oldSelectedInstallment = appData.financing.selectedInstallment;
    appData.financing.selectedInstallment = null; // Limpa seleção ao recalcular

    generateInstallmentOptions();

    // Tenta resselecionar a parcela antiga se ela ainda for válida após a geração
    if (oldSelectedInstallment) {
        const optionCard = document.querySelector(`.installment-option-card .months:contains("${oldSelectedInstallment.months}")`);
        if (optionCard) {
             const parentCard = optionCard.closest('.installment-option-card');
             // Verifica se o valor calculado para essa parcela ainda é o mesmo (evita bugs se a lógica mudar)
             const newlyCalculatedValue = parseFloat(parentCard.querySelector('.value').textContent.replace('R$', '').trim());
             if (Math.abs(newlyCalculatedValue - oldSelectedInstallment.value) < 0.005) { // Tolerância pequena para float
                selectInstallment(oldSelectedInstallment.months, oldSelectedInstallment.value, oldSelectedInstallment.totalPaid, parentCard);
             }
        }
    }
}

// NOVA LÓGICA calculatePMT: Calcula a parcela com base no markup total interpolado
function calculatePMT(principal, numberOfPayments) {
    if (principal <= 0 || numberOfPayments <= 0) return 0;
    if (numberOfPayments < 3 || numberOfPayments > 48 || numberOfPayments % 3 !== 0) return 0; // Apenas parcelas de 3 em 3 até 48

    const currentRates = appData.financing.currentRates; // { rate3x, rate48x }
    const rate3x = currentRates.rate3x;
    const rate48x = currentRates.rate48x;

    // Calcula a taxa total de markup para numberOfPayments usando interpolação linear
    // A taxa começa em rate3x para N=3 e termina em rate48x para N=48
    const totalMarkupRate = rate3x - ((numberOfPayments - 3) / (48 - 3)) * (rate3x - rate48x);

    // Calcula o valor total a ser pago (Principal + Markup)
    const totalAmountToPay = principal * (1 + totalMarkupRate);

    // O valor da parcela é o total a pagar dividido pelo número de parcelas
    const pmt = totalAmountToPay / numberOfPayments;

    return pmt; // Retorna o valor da parcela
}


function generateInstallmentOptions() {
    const container = document.getElementById('installmentOptionsContainer');
    container.innerHTML = '';
    const amount = appData.financing.amountForInstallmentCalculation;
    const btnNext4 = document.getElementById('btnNext4');

    // Lógica de habilitação/desabilitação do botão Próximo Tela 4
    if (amount <= 0 && appData.baseTotalAmount > 0) {
        container.innerHTML = "<p>A entrada cobre o valor total ou não há valor a financiar. Não há parcelamento.</p>";
        appData.financing.selectedInstallment = null;
        if(btnNext4) btnNext4.disabled = false; // Não precisa selecionar parcela se não financia
        return;
    }
    if (appData.baseTotalAmount === 0) {
         container.innerHTML = "<p>Adicione produtos para ver as opções.</p>";
         appData.financing.selectedInstallment = null;
         if(btnNext4) btnNext4.disabled = true;
         return;
    }
    if (amount <= 0 && appData.baseTotalAmount === 0) { // Garante que esteja desabilitado se não tem produtos e não financia
         container.innerHTML = "<p>Adicione produtos para ver as opções.</p>";
         appData.financing.selectedInstallment = null;
         if(btnNext4) btnNext4.disabled = true;
         return;
    }


    const installmentPlans = [];
    for (let i = 3; i <= 48; i += 3) { installmentPlans.push(i); }

    let hasOptions = false;
    installmentPlans.forEach(nper => {
        const pmt = calculatePMT(amount, nper);
        // Critério para exibir a opção: parcela > 0 E (valor da parcela >= R$1.00 OU número de parcelas <= 12)
        if (pmt > 0 && (pmt >= 1.00 || nper <= 12)) {
             hasOptions = true;
             const card = document.createElement('div'); card.classList.add('installment-option-card');
             card.innerHTML = `<div class="months">${nper}x</div>
                               <div class="value">R$ ${pmt.toFixed(2)}</div>`;
             // Calcula o total pago usando o PMT calculado * nper
             const totalPaid = pmt * nper; 
             card.onclick = () => selectInstallment(nper, pmt, totalPaid, card);
             if (appData.financing.selectedInstallment && appData.financing.selectedInstallment.months === nper) {
                 card.classList.add('selected');
             }
             container.appendChild(card);
        }
    });

    if (!hasOptions && amount > 0) {
        container.innerHTML = "<p>Não foi possível gerar opções de parcelamento para o valor financiado.</p>";
        appData.financing.selectedInstallment = null;
         if(btnNext4) btnNext4.disabled = true;
    } else if (hasOptions && amount > 0) {
         // Se há opções mas nenhuma selecionada, o botão Próximo deve ficar desabilitado
         if(btnNext4) btnNext4.disabled = !appData.financing.selectedInstallment;
    }
}

function selectInstallment(months, value, totalPaid, element) {
    appData.financing.selectedInstallment = { months, value, totalPaid };
    document.querySelectorAll('.installment-option-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('btnNext4').disabled = false;
}

function calculateLastInstallmentDate(firstDateStr, months) {
    // Assume firstDateStr é YYYY-MM-DD UTC
    const dateParts = firstDateStr.split('-');
    // Cria a data no fuso horário local primeiro para evitar problemas com setMonth em fusos horários,
    // mas calcula a data final e converte de volta para YYYY-MM-DD em UTC.
    // Alternativamente, podemos usar Date.UTC e setUTCMonth
     const year = parseInt(dateParts[0]), month = parseInt(dateParts[1]) - 1, day = parseInt(dateParts[2]);
     const firstDateUTC = new Date(Date.UTC(year, month, day));
     const lastDateUTC = new Date(firstDateUTC);
     lastDateUTC.setUTCMonth(firstDateUTC.getUTCMonth() + months - 1); // months - 1 porque a primeira já conta como 1

    return formatDateForDisplay(formatDateForInput(lastDateUTC));
}

function formatCurrencyForFeedback(n) {
    if (n === null || n === undefined) return "R$ 0,00";
    const num = parseFloat(n);
    if (isNaN(num)) return "valor inválido";
    // Usa toLocaleString para formatação correta de moeda BRL
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function prepareSummaryAndWhatsApp() {
    const si = appData.financing.selectedInstallment;
    const totalWithWarranty = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);
    const amountFinancedDisplay = totalWithWarranty - appData.entry.calculatedAmount;


    document.getElementById('summaryClientName').textContent = appData.client.name;
    document.getElementById('summaryClientCpf').textContent = appData.client.cpf;
    document.getElementById('summaryOrderDate').textContent = appData.order.currentDate;

    const productListDiv = document.getElementById('summaryProductList'); productListDiv.innerHTML = '';
    appData.products.forEach(p => {
        const pElem = document.createElement('p'); pElem.classList.add('summary-product-item');
        pElem.textContent = `- ${p.name} (${formatCurrencyForFeedback(p.value)})`; productListDiv.appendChild(pElem);
    });
    document.getElementById('summaryItemCount').textContent = appData.products.length;
    document.getElementById('summaryTotalProducts').textContent = formatCurrencyForFeedback(appData.baseTotalAmount);
    document.getElementById('summaryWarrantyType').textContent = appData.warranty.type === 'none' ? 'Nenhuma' : `${appData.warranty.type} meses`;
    
    document.getElementById('summaryEntryAmount').textContent = formatCurrencyForFeedback(appData.entry.calculatedAmount);
    document.getElementById('summaryEntryPercentage').textContent = `${(appData.entry.effectivePercentage * 100).toFixed(1)}%`;
    
    document.getElementById('summaryAmountFinancedInternal').textContent = formatCurrencyForFeedback(amountFinancedDisplay);

    // Dados do financiamento só aparecem se houver parcela selecionada (ou seja, se houver valor a financiar > 0)
    const financingSummaryDiv = document.getElementById('financingSummaryDetails');
    const noFinancingMessageDiv = document.getElementById('noFinancingSummaryMessage');

    if (si && si.months > 0) {
        financingSummaryDiv.style.display = 'block';
        noFinancingMessageDiv.style.display = 'none';
        document.getElementById('summaryInstallmentMonths').textContent = si.months;
        document.getElementById('summaryInstallmentValue').textContent = formatCurrencyForFeedback(si.value);
        document.getElementById('summaryTotalPaidCarnet').textContent = formatCurrencyForFeedback(si.totalPaid);
        document.getElementById('summaryFirstInstallmentDate').textContent = formatDateForDisplay(appData.order.firstInstallmentDate);
        appData.order.lastInstallmentDate = calculateLastInstallmentDate(appData.order.firstInstallmentDate, si.months);
        document.getElementById('summaryLastInstallmentDate').textContent = appData.order.lastInstallmentDate;

    } else {
         financingSummaryDiv.style.display = 'none';
         noFinancingMessageDiv.style.display = 'block';
         if (amountFinancedDisplay > 0) {
              noFinancingMessageDiv.textContent = "Não foi possível gerar opções de parcelamento para o valor financiado.";
         } else {
              noFinancingMessageDiv.textContent = "Não há valor a financiar. O total foi coberto pela entrada.";
         }
         appData.order.lastInstallmentDate = ''; // Limpa data da última parcela se não há financiamento
         document.getElementById('summaryLastInstallmentDate').textContent = 'N/A';
    }


    const todayForWhatsapp = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: 'long', year: 'numeric'});
    let conversationalWhatsappMsg = `\ud83d\udc4b Olá Edney, tudo bem com você? Espero que sim!\n\n`;
    conversationalWhatsappMsg += `\ud83d\udcc5 Estou te enviando esse Orçamento de Financiamento, hoje dia ${todayForWhatsapp}.\n\n`;
    conversationalWhatsappMsg += `\ud83d\udc64 Meu nome completo é ${appData.client.name}, \ud83d\udcc3 CPF ${appData.client.cpf}.\n\n`; // Usando \ud83d\udcc3 para CPF (ID Card)
    
    const numItens = appData.products.length;
    if (numItens === 1) {
        conversationalWhatsappMsg += `\ud83d\udecd\ufe0f Queria fazer a simulação de ${numItens} item, sendo o produto:\n`;
    } else {
        conversationalWhatsappMsg += `\ud83d\udecd\ufe0f Queria fazer a simulação de ${numItens} itens, sendo eles:\n`;
    }

    appData.products.forEach(p => {
        conversationalWhatsappMsg += `  \ud83d\udce6 ${p.name} (valor ${formatCurrencyForFeedback(p.value)})\n`;
    });
    conversationalWhatsappMsg += `\n\ud83d\udcb0 Somei tudo aqui e vai dar o total de ${formatCurrencyForFeedback(appData.baseTotalAmount)}.\n\n`;

     if (appData.warranty.type !== 'none') {
        conversationalWhatsappMsg += `\ud83d\udee1\ufe0f Também optei pela garantia estendida de ${appData.warranty.type} meses, que adiciona ${formatCurrencyForFeedback(appData.baseTotalAmount * appData.warranty.percentageValue)} ao total, resultando em ${formatCurrencyForFeedback(totalWithWarranty)}.\n\n`;
    }


    if (appData.entry.calculatedAmount > 0) {
        conversationalWhatsappMsg += `\ud83d\udcb0 Estou pensando em dar uma *entrada de ${formatCurrencyForFeedback(appData.entry.calculatedAmount)}*. `;
        conversationalWhatsappMsg += `\ud83d\udcb8 Com isso, o valor para financiar fica em *${formatCurrencyForFeedback(amountFinancedDisplay)}*.\n\n`;
    } else {
        conversationalWhatsappMsg += `\ud83d\udcb8 No momento, prefiro *não dar entrada*, então o valor para financiar seria de *${formatCurrencyForFeedback(amountFinancedDisplay)}*.\n\n`;
    }

    if (si && si.months > 0) {
        conversationalWhatsappMsg += `\u2705 A opção de parcelamento que mais me agradou foi em *${si.months} vezes de ${formatCurrencyForFeedback(si.value)}*.\n`;
        conversationalWhatsappMsg += `\ud83d\udcc5 A primeira parcela ficaria para *${formatDateForDisplay(appData.order.firstInstallmentDate)}*.`;
        if (appData.order.lastInstallmentDate) {
             conversationalWhatsappMsg += ` E a última parcela para *${appData.order.lastInstallmentDate}*.\n\n`;
        } else {
             conversationalWhatsappMsg += `\n\n`; // Should not happen if si.months > 0, but safety
        }
         conversationalWhatsappMsg += `\ud83d\udcb3 O total a ser pago no carnê seria de ${formatCurrencyForFeedback(si.totalPaid)}.\n\n`;

    } else {
        conversationalWhatsappMsg += `\u274c Não há parcelamento pois a entrada cobre o valor total. O valor total a pagar é de ${formatCurrencyForFeedback(totalWithWarranty)}.\n\n`;
    }

    conversationalWhatsappMsg += `\ud83d\ude4f Obrigado!\n${appData.client.name.split(' ')[0]}`;
    document.getElementById('whatsappMessageFinal').value = conversationalWhatsappMsg;

    let screenFeedbackMsg = `\uD83C\uDF89 *Simulação Pronta para Envio!*\n\n`;
    screenFeedbackMsg += `Olá ${appData.client.name.split(' ')[0]},\n\n`;
    screenFeedbackMsg += `Sua simulação foi gerada. Ao clicar no botão "Enviar Simulação por WhatsApp", a mensagem acima (no campo de texto) será preparada para você enviar ao Edney.\n\n`;
    screenFeedbackMsg += `Após o envio, a equipe financeira analisará sua solicitação e entrará em contato em até 24 horas úteis.\n\n`;
    screenFeedbackMsg += `Agradecemos o seu contato!`;
    appData.feedbackMessage = screenFeedbackMsg;
}

function sendWhatsAppMessage() {
    const messageForWhatsapp = document.getElementById('whatsappMessageFinal').value;
    if (!messageForWhatsapp || messageForWhatsapp.startsWith("Erro:")) {
        alert("Mensagem para WhatsApp não gerada ou contém erro. Por favor, refaça os passos ou verifique a seleção de parcelas.");
        return;
    }
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messageForWhatsapp)}`;
    window.open(url, '_blank');

    const summaryContainer = document.getElementById('operatorSummaryContainer');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const restartButton = document.querySelector('#screen5 .btn-restart');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage');
    const screen5Title = document.querySelector('#screen5 h2');


    if (summaryContainer && whatsappTextarea && sendButton && prevButton && feedbackDiv && screen5Title) {
        summaryContainer.style.display = 'none'; 
        whatsappTextarea.style.display = 'none'; 
        sendButton.style.display = 'none';     
        prevButton.style.display = 'none';     

        // O div já existe no HTML, apenas alteramos seu conteúdo e visibilidade
        
        feedbackDiv.innerHTML = `<h4 style="text-align:center; margin-bottom:15px;">\ud83d\udce9 Mensagem Preparada!</h4>
                                 ${appData.feedbackMessage.replace(/\n/g, '<br>')}`;
        feedbackDiv.style.display = 'block';
        
        screen5Title.innerHTML = '<i class="fas fa-check-circle"></i> Quase lá!';
    }
}

function restartSimulation() {
    // Reset appData to initial state (using the new interestSettings)
    Object.assign(appData, {
        client: { name: '', cpf: '' },
        order: { currentDate: '', paymentDate: '', firstInstallmentDate: '', daysToFirstInstallment: 0, lastInstallmentDate: '' },
        products: [], baseTotalAmount: 0,
        entry: { type: 'none', percentageForFixed: 0, customAmountRaw: 0, calculatedAmount: 0, effectivePercentage: 0 },
        warranty: { type: 'none', percentageValue: 0 },
        financing: {
            amountForInstallmentCalculation: 0, selectedInstallment: null,
            // Reset currentRates based on the initial 'none' entry
            currentRates: { ...appData.financing.interestSettings.noEntry }, 
            // Keep the interest settings data
            interestSettings: { 
                noEntry:    { rate3x: 0.17, rate48x: 0.10 }, 
                entry10pct: { rate3x: 0.15, rate48x: 0.09 }, 
                entry20pct: { rate3x: 0.14, rate48x: 0.08 }, 
                entry30pct: { rate3x: 0.13, rate48x: 0.07 }, 
                entry40pct: { rate3x: 0.12, rate48x: 0.06 }, 
                entry50plus: { rate3x: 0.11, rate48x: 0.05 }  
            }
        },
        feedbackMessage: ''
    });

    // Reset UI elements for Screen 1
    document.getElementById('clientName').value = '';
    document.getElementById('clientCpf').value = '';
    document.getElementById('selectedPaymentDateHidden').value = '';
    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none';
    document.querySelectorAll('#paymentDayOptionsContainer .option-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false);
    document.getElementById('firstInstallmentDateInfo').textContent = 'A definir'; 
    document.getElementById('daysToFirstInstallment').textContent = 'A definir'; 
    checkScreen1Completion(); // Re-check completion for Screen 1

    // Reset UI elements for Screen 2
    document.getElementById('productSku').value = '';
    document.getElementById('productFetchDisplay').style.display = 'none';
    document.getElementById('btnAddProductToList').disabled = true;
    updateProductVisor(); // Clears product list and updates visor/total

    // Reset UI elements for Screen 3
    // Select the 'none' entry option and 'none' warranty option
    document.querySelector('#entryOptNone').checked = true;
    selectEntryOption('none', document.querySelector('.entry-options .option-item input[value="none"]').closest('.option-item')); // Pass element reference
    
    document.getElementById('customEntryAmountInput').value = '';
    document.getElementById('customEntryValueGroup').style.display = 'none';
    document.getElementById('finalEntryValueDisplay').textContent = '0.00';
    document.getElementById('finalAmountToFinanceDisplay').textContent = '0.00';
    const entryResultBox = document.getElementById('entryResultInfoBox');
    if(entryResultBox) entryResultBox.style.display = 'none';

    document.querySelector('#warrantyOptNone').checked = true;
    selectWarrantyOption('none', document.querySelector('.warranty-options .option-item input[value="none"]').closest('.option-item')); // Pass element reference

    // Reset UI elements for Screen 4
    document.getElementById('installmentOptionsContainer').innerHTML = '<p>Aguardando...</p>'; // Clear options
    const btnNext4 = document.getElementById('btnNext4');
    if(btnNext4) btnNext4.disabled = true; // Disable next until options are generated/selected

    // Reset UI elements for Screen 5
    document.getElementById('whatsappMessageFinal').value = '';
    const summaryContainer = document.getElementById('operatorSummaryContainer');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage');
    const screen5Title = document.querySelector('#screen5 h2');

    if (summaryContainer) summaryContainer.style.display = 'block';
    if (whatsappTextarea) whatsappTextarea.style.display = 'block';
    if (sendButton) sendButton.style.display = 'block'; 
    if (prevButton) prevButton.style.display = 'block'; 
    if (feedbackDiv) feedbackDiv.style.display = 'none';
    if (screen5Title) screen5Title.innerHTML = '<i class="fas fa-file-alt"></i> Resumo da Simulação';
    
    // Re-initialize Screen 1 (updates current date, generates payment days, etc.)
    initializeScreen1();
    showScreen(1); // Go back to the first screen
}

document.getElementById('clientName').addEventListener('input', (event) => {
    appData.client.name = event.target.value.trim();
    checkScreen1Completion();
});

// Event listeners for Entry Options (added for robustness on page load)
document.querySelectorAll('.entry-options .option-item').forEach(item => {
    const radio = item.querySelector('input[type="radio"]');
    if (radio) {
        // Remove inline onclick
        item.onclick = null; 
        item.addEventListener('click', () => {
             selectEntryOption(radio.value, item);
        });
        radio.addEventListener('change', () => {
             if (radio.checked) selectEntryOption(radio.value, item);
        });
    }
});

// Event listeners for Warranty Options (added for robustness on page load)
document.querySelectorAll('.warranty-options .option-item').forEach(item => {
    const radio = item.querySelector('input[type="radio"]');
    if (radio) {
        // Remove inline onclick
        item.onclick = null; 
        item.addEventListener('click', () => {
             selectWarrantyOption(radio.value, item);
        });
         radio.addEventListener('change', () => {
             if (radio.checked) selectWarrantyOption(radio.value, item);
        });
    }
});
