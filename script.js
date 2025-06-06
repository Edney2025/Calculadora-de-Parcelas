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
        interestSettings: {
            noEntry:    { rate3x: 0.16, rate48x: 0.10 },
            entry10pct: { rate3x: 0.14, rate48x: 0.09 },
            entry20pct: { rate3x: 0.13, rate48x: 0.08 },
            entry30pct: { rate3x: 0.12, rate48x: 0.07 },
            entry40pct: { rate3x: 0.11, rate48x: 0.06 },
            entry50plus: { rate3x: 0.10, rate48x: 0.05 },
            monthlyRateForOthers: 0.0399 // Taxa mensal para Tabela Price
        },
        currentRates: {}
    },
    feedbackMessage: '' // Para a mensagem pós-envio na tela
};

function roundUpToNearest5(num) {
    if (num <= 0) return 0;
    return Math.ceil(num / 5) * 5;
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
    generatePaymentDayOptions();
    
    document.getElementById('clientName').value = appData.client.name;
    document.getElementById('clientCpf').value = appData.client.cpf;

    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    const firstInstallmentDateSpan = document.getElementById('firstInstallmentDateInfo');
    const daysToFirstInstallmentSpan = document.getElementById('daysToFirstInstallment');
    
    appData.order.paymentDate = '';
    appData.order.firstInstallmentDate = '';
    appData.order.daysToFirstInstallment = 0;
    document.getElementById('selectedPaymentDateHidden').value = '';
    document.querySelectorAll('#paymentDayOptionsContainer .option-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false);


    if (firstInstallmentDateSpan) firstInstallmentDateSpan.textContent = 'A definir';
    if (daysToFirstInstallmentSpan) daysToFirstInstallmentSpan.textContent = 'A definir';
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none';
    
    checkScreen1Completion();
}


function generatePaymentDayOptions() {
    const container = document.getElementById('paymentDayOptionsContainer');
    if (!container) return;
    container.innerHTML = '';
    const today = new Date();
    const currentDayUTC = today.getUTCDate();
    const currentMonthUTC = today.getUTCMonth();
    const currentYearUTC = today.getUTCFullYear();
    
    const limitDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 33)); 

    const fixedDays = [5, 10, 15, 20, 25, 30];
    let optionsGenerated = 0;
    const addedDates = new Set();

    for (let monthOffset = 0; monthOffset < 2 && optionsGenerated < 6; monthOffset++) {
        const targetMonth = currentMonthUTC + monthOffset;
        const year = currentYearUTC + Math.floor(targetMonth / 12);
        const month = targetMonth % 12;

        fixedDays.forEach(day => {
            if (optionsGenerated >= 6) return;
            
            const paymentDateAttempt = new Date(Date.UTC(year, month, day));
            
            if (paymentDateAttempt.getUTCDate() !== day) {
                return; 
            }

            const minSelectableDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 1));

            if (paymentDateAttempt.getTime() >= minSelectableDate.getTime() && 
                paymentDateAttempt.getTime() <= limitDate.getTime()) {
                
                const dateStr = formatDateForInput(paymentDateAttempt);
                if (addedDates.has(dateStr)) return;
                addedDates.add(dateStr);

                const optionDiv = document.createElement('div');
                optionDiv.classList.add('option-item');
                optionDiv.innerHTML = `<input type="radio" name="paymentDay" id="dayOpt${dateStr}" value="${dateStr}" style="display:none;">
                                       <label for="dayOpt${dateStr}">${formatDateForDisplay(dateStr)}</label>`;
                optionDiv.onclick = () => selectPaymentDate(dateStr, optionDiv);
                container.appendChild(optionDiv);
                optionsGenerated++;
            }
        });
    }
    if (optionsGenerated === 0 && container) {
        container.innerHTML = "<p style='grid-column: 1 / -1; text-align: center; font-size: 0.9em; color: #555;'>Nenhuma data disponível nos próximos 33 dias para os dias fixos.</p>";
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
    
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    const paymentDParts = dateStr.split('-');
    const paymentD = new Date(Date.UTC(parseInt(paymentDParts[0]), parseInt(paymentDParts[1])-1, parseInt(paymentDParts[2])));
    
    const diffTime = paymentD.getTime() - today.getTime();
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
    const cpf = appData.client.cpf;
    const paymentDate = appData.order.paymentDate;
    document.getElementById('btnNext1').disabled = !(name && cpf && cpf.length === 14 && paymentDate);
}

function formatDateForInput(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) {
    if (!dateString) return 'N/A';
    const dateParts = dateString.split('-');
    if (dateParts.length === 3) {
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
        updateEntryPlaceholders();
        document.getElementById('btnNext3').disabled = false; 
        const entryResultInfoBox = document.getElementById('entryResultInfoBox');
        if (appData.entry.type !== '' && entryResultInfoBox) {
             entryResultInfoBox.style.display = (appData.entry.type === 'none' && appData.entry.calculatedAmount === 0 && appData.baseTotalAmount === 0) ? 'none' : 'block';
        } else if (entryResultInfoBox) {
            entryResultInfoBox.style.display = 'none';
        }
    } else if (currentScreenNum === 3) {
        updateAllCalculationsAndUI();
        document.getElementById('btnNext4').disabled = !appData.financing.selectedInstallment;
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
        const totalValueForEntryValidation = appData.baseTotalAmount * (1 + appData.warranty.percentageValue); 
        if (appData.entry.type === 'custom' && appData.entry.calculatedAmount > totalValueForEntryValidation && totalValueForEntryValidation > 0) {
             alert('A entrada personalizada não pode ser maior que o valor total dos produtos.');
             return false;
        }
    }
    if (screenNumber === 4) {
        if (!appData.financing.selectedInstallment) {
            alert('Selecione uma opção de parcelamento.'); return false;
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
            nameDisplay.textContent = data.name; priceDisplay.textContent = data.price.toFixed(2);
            nameHidden.value = data.name; valueHidden.value = data.price;
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
    updateAllCalculationsAndUI();
}

function removeProductFromVisor(index) {
    appData.products.splice(index, 1);
    updateProductVisor();
}

function updateEntryPlaceholders() {
    const totalValueForPlaceholders = appData.baseTotalAmount;
    document.querySelectorAll('.entry-value-placeholder').forEach(span => {
        const pct = parseFloat(span.dataset.pct);
        if (!isNaN(pct)) {
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
    }

    if (type === 'custom') {
        customGroup.style.display = 'block';
        customInput.value = appData.entry.customAmountRaw > 0 ? appData.entry.customAmountRaw.toFixed(2) : '';
        if (appData.entry.customAmountRaw > 0) handleCustomEntryValueChange();
        else appData.entry.calculatedAmount = 0;
    } else {
        customGroup.style.display = 'none';
        if (type === 'none') {
            appData.entry.percentageForFixed = 0;
        } else {
            appData.entry.percentageForFixed = parseInt(type) / 100;
        }
    }
    updateAllCalculationsAndUI();
    if (entryResultInfoBox) entryResultInfoBox.style.display = 'block';
}

function handleCustomEntryValueChange() {
    if (appData.entry.type === 'custom') {
        appData.entry.customAmountRaw = parseFloat(document.getElementById('customEntryAmountInput').value) || 0;
        updateAllCalculationsAndUI();
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
    }
    updateAllCalculationsAndUI();
}

function updateAllCalculationsAndUI() {
    const totalWithWarrantyEffect = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);

    if (appData.entry.type === 'custom') {
        appData.entry.calculatedAmount = roundUpToNearest5(appData.entry.customAmountRaw);
        if (appData.entry.calculatedAmount > totalWithWarrantyEffect && totalWithWarrantyEffect > 0) {
            appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect);
            const customInput = document.getElementById('customEntryAmountInput');
            if (customInput && customInput.value !== appData.entry.calculatedAmount.toFixed(2)) {
                customInput.value = appData.entry.calculatedAmount.toFixed(2);
            }
        }
    } else if (appData.entry.type !== 'none') {
        appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect * appData.entry.percentageForFixed);
    } else {
        appData.entry.calculatedAmount = 0;
    }
    
    appData.entry.effectivePercentage = totalWithWarrantyEffect > 0 ? (appData.entry.calculatedAmount / totalWithWarrantyEffect) : 0;
    if (appData.entry.calculatedAmount >= totalWithWarrantyEffect && totalWithWarrantyEffect > 0) {
        appData.entry.effectivePercentage = 1;
        appData.entry.calculatedAmount = totalWithWarrantyEffect;
    }

    document.getElementById('finalEntryValueDisplay').textContent = appData.entry.calculatedAmount.toFixed(2);
    appData.financing.amountForInstallmentCalculation = totalWithWarrantyEffect - appData.entry.calculatedAmount;
    if (appData.financing.amountForInstallmentCalculation < 0) appData.financing.amountForInstallmentCalculation = 0;
    document.getElementById('finalAmountToFinanceDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);

    const p = appData.entry.effectivePercentage;
    const rates = appData.financing.interestSettings;
    if (p < 0.10) appData.financing.currentRates = rates.noEntry;
    else if (p < 0.20) appData.financing.currentRates = rates.entry10pct;
    else if (p < 0.30) appData.financing.currentRates = rates.entry20pct;
    else if (p < 0.40) appData.financing.currentRates = rates.entry30pct;
    else if (p < 0.50) appData.financing.currentRates = rates.entry40pct;
    else appData.financing.currentRates = rates.entry50plus;

    document.getElementById('installmentCalculationBaseDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);
    generateInstallmentOptions();
}

function calculatePMT(principal, numberOfPayments) {
    if (principal <= 0) return 0;
    const currentRates = appData.financing.currentRates; 
    const settings = appData.financing.interestSettings;

    if (numberOfPayments === 3) {
        return (principal * (1 + currentRates.rate3x)) / 3;
    } else if (numberOfPayments === 48) {
        return (principal * (1 + currentRates.rate48x)) / 48;
    } else {
        let monthlyRate = settings.monthlyRateForOthers;
        if (monthlyRate === 0) return principal / numberOfPayments;
        if (monthlyRate >= 1) monthlyRate = monthlyRate / 100; 
        if (Math.pow(1 + monthlyRate, numberOfPayments) - 1 === 0) return principal / numberOfPayments;
        return (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
    }
}

function generateInstallmentOptions() {
    const container = document.getElementById('installmentOptionsContainer');
    container.innerHTML = '';
    const amount = appData.financing.amountForInstallmentCalculation;
    const btnNext4 = document.getElementById('btnNext4');

    if (appData.products.length === 0 && currentScreen >= 3) {
        container.innerHTML = "<p>Volte e adicione produtos primeiro.</p>";
        appData.financing.selectedInstallment = null;
        if(btnNext4) btnNext4.disabled = true;
        return;
    }
    if (amount <= 0 && appData.baseTotalAmount > 0) {
        container.innerHTML = "<p>A entrada cobre o valor total ou não há valor a financiar. Não há parcelamento.</p>";
        appData.financing.selectedInstallment = null;
        if(btnNext4) btnNext4.disabled = true;
        return;
    }
     if (appData.products.length === 0) {
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
        if (pmt > 0 && (amount / nper >= 1.00 || nper <=12 )) {
            hasOptions = true;
            const card = document.createElement('div'); card.classList.add('installment-option-card');
            card.innerHTML = `<div class="months">${nper}x</div>
                              <div class="value">R$ ${pmt.toFixed(2)}</div>`;
            card.onclick = () => selectInstallment(nper, pmt, pmt * nper, card);
            if (appData.financing.selectedInstallment && appData.financing.selectedInstallment.months === nper) {
                card.classList.add('selected');
            }
            container.appendChild(card);
        }
    });

    if (!hasOptions && amount > 0) {
        container.innerHTML = "<p>Não foi possível gerar opções (ex: parcelas muito baixas).</p>";
    }
    if(btnNext4) btnNext4.disabled = !appData.financing.selectedInstallment;
}

function selectInstallment(months, value, totalPaid, element) {
    appData.financing.selectedInstallment = { months, value, totalPaid };
    document.querySelectorAll('.installment-option-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    document.getElementById('btnNext4').disabled = false;
}

function calculateLastInstallmentDate(firstDateStr, months) {
    const dateParts = firstDateStr.split('-');
    const year = parseInt(dateParts[0]), month = parseInt(dateParts[1]) - 1, day = parseInt(dateParts[2]);
    const firstDate = new Date(Date.UTC(year, month, day));
    const lastDate = new Date(firstDate);
    lastDate.setUTCMonth(firstDate.getUTCMonth() + months - 1);
    return formatDateForDisplay(formatDateForInput(lastDate));
}

function formatCurrencyForFeedback(n) {
    if (n === null || n === undefined) return "R$ 0,00";
    const num = parseFloat(n);
    if (isNaN(num)) return "valor inválido";
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function prepareSummaryAndWhatsApp() {
    const si = appData.financing.selectedInstallment;
    if (!si) { 
        alert("Nenhuma parcela selecionada!"); 
        document.getElementById('whatsappMessageFinal').value = "Erro: Nenhuma parcela selecionada.";
        return; 
    }

    // --- MENSAGEM CONVERSACIONAL PARA O WHATSAPP (COM EMOJIS CORRIGIDOS E NEGRIRO) ---
    const todayForWhatsapp = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: 'long', year: 'numeric'});
    let conversationalWhatsappMsg = `👋 Olá Edney, tudo bem com você? Espero que sim!\n\n`;
    conversationalWhatsappMsg += `📅 Estou te enviando esse Orçamento de Financiamento, hoje dia *${todayForWhatsapp}*.\n\n`;
    conversationalWhatsappMsg += `👤 Meu nome completo é *${appData.client.name}*, 📃 CPF *${appData.client.cpf}*.\n\n`;
    
    const numItens = appData.products.length;
    if (numItens === 1) {
        conversationalWhatsappMsg += `🛍️ Queria fazer a simulação de *${numItens} item*, sendo o produto:\n`;
    } else {
        conversationalWhatsappMsg += `🛍️ Queria fazer a simulação de *${numItens} itens*, sendo eles:\n`;
    }

    appData.products.forEach(p => {
        conversationalWhatsappMsg += `  📦 *${p.name}* (valor ${formatCurrencyForFeedback(p.value)})\n`;
    });
    conversationalWhatsappMsg += `\n💰 Somei tudo aqui e vai dar o total de *${formatCurrencyForFeedback(appData.baseTotalAmount)}*.\n\n`;

    if (appData.entry.calculatedAmount > 0) {
        conversationalWhatsappMsg += `💰 Estou pensando em dar uma entrada de *${formatCurrencyForFeedback(appData.entry.calculatedAmount)}*. `;
        const financedForClientView = (appData.baseTotalAmount * (1 + appData.warranty.percentageValue)) - appData.entry.calculatedAmount;
        conversationalWhatsappMsg += `💸 Com isso, o valor para financiar ficaria em *${formatCurrencyForFeedback(financedForClientView > 0 ? financedForClientView : 0)}*.\n\n`;
    } else {
        const financedWithoutEntry = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);
        conversationalWhatsappMsg += `💸 No momento, prefiro *não dar entrada*, então o valor para financiar seria de *${formatCurrencyForFeedback(financedWithoutEntry)}*.\n\n`;
    }

    if (appData.warranty.type !== 'none') {
        conversationalWhatsappMsg += `🛡️ Também optei pela garantia estendida de *${appData.warranty.type} meses*.\n`;
    }

    conversationalWhatsappMsg += `✅ A opção de parcelamento que mais me agradou foi em *${si.months} vezes* de *${formatCurrencyForFeedback(si.value)}*.\n`;
    conversationalWhatsappMsg += `📅 A primeira parcela ficaria para *${formatDateForDisplay(appData.order.firstInstallmentDate)}*.`;
    appData.order.lastInstallmentDate = calculateLastInstallmentDate(appData.order.firstInstallmentDate, si.months);
    if (appData.order.lastInstallmentDate) {
        conversationalWhatsappMsg += ` E a última parcela para *${appData.order.lastInstallmentDate}*.\n\n`;
    } else {
        conversationalWhatsappMsg += `\n\n`;
    }
    conversationalWhatsappMsg += `🙏 Obrigado!\n*${appData.client.name.split(' ')[0]}*`;
    document.getElementById('whatsappMessageFinal').value = conversationalWhatsappMsg;

    // --- PREPARAR MENSAGEM DE FEEDBACK PÓS-ENVIO (para a tela da calculadora) ---
    let screenFeedbackMsg = `🎉 *Simulação Pronta para Envio!*\n\n`; // Usando 🎉 diretamente
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

    const preSendInfo = document.getElementById('preSendInfo');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage');
    const screenTitle = document.getElementById('screen5Title'); // Pegando o H2 pelo ID

    if (preSendInfo) preSendInfo.style.display = 'none'; 
    if (whatsappTextarea) whatsappTextarea.style.display = 'none'; 
    if (sendButton) sendButton.style.display = 'none';     
    if (prevButton) prevButton.style.display = 'none';     

    if (feedbackDiv) {
        feedbackDiv.innerHTML = `<h4 style="text-align:center; margin-bottom:15px;">📩 Mensagem Preparada!</h4> 
                                 ${appData.feedbackMessage.replace(/\n/g, '<br>')}`; // Usando 📩 diretamente
        feedbackDiv.style.display = 'block';
    }
    if (screenTitle) {
        screenTitle.innerHTML = '<i class="fas fa-check-circle"></i> Quase lá!';
    }
}

function restartSimulation() {
    Object.assign(appData, {
        client: { name: '', cpf: '' },
        order: { currentDate: '', paymentDate: '', firstInstallmentDate: '', daysToFirstInstallment: 0, lastInstallmentDate: '' },
        products: [], baseTotalAmount: 0,
        entry: { type: 'none', percentageForFixed: 0, customAmountRaw: 0, calculatedAmount: 0, effectivePercentage: 0 },
        warranty: { type: 'none', percentageValue: 0 },
        financing: {
            amountForInstallmentCalculation: 0, selectedInstallment: null,
            currentRates: { ...appData.financing.interestSettings.noEntry },
            interestSettings: { ...appData.financing.interestSettings }
        },
        feedbackMessage: ''
    });

    document.getElementById('clientName').value = '';
    document.getElementById('clientCpf').value = '';
    document.getElementById('selectedPaymentDateHidden').value = '';
    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none';
    document.querySelectorAll('#paymentDayOptionsContainer .option-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false);
    document.getElementById('firstInstallmentDateInfo').textContent = 'A definir';
    document.getElementById('daysToFirstInstallment').textContent = 'A definir';

    document.getElementById('productSku').value = '';
    document.getElementById('productFetchDisplay').style.display = 'none';
    document.getElementById('btnAddProductToList').disabled = true;
    updateProductVisor();

    const entryOptNoneRadio = document.querySelector('#entryOptNone');
    if(entryOptNoneRadio) entryOptNoneRadio.checked = true;
    const entryOptNoneDiv = document.querySelector('.entry-options .option-item[onclick*="\'none\'"]');
    if(entryOptNoneDiv) selectEntryOption('none', entryOptNoneDiv);
    
    document.getElementById('customEntryAmountInput').value = '';
    document.getElementById('customEntryValueGroup').style.display = 'none';
    document.getElementById('finalEntryValueDisplay').textContent = '0.00';
    document.getElementById('finalAmountToFinanceDisplay').textContent = '0.00';
    const entryResultBox = document.getElementById('entryResultInfoBox');
    if(entryResultBox) entryResultBox.style.display = 'none';

    const warrantyOptNoneRadio = document.querySelector('#warrantyOptNone');
    if(warrantyOptNoneRadio) warrantyOptNoneRadio.checked = true;
    const warrantyOptNoneDiv = document.querySelector('.warranty-options .option-item[onclick*="\'none\'"]');
    if(warrantyOptNoneDiv) selectWarrantyOption('none', warrantyOptNoneDiv);

    document.getElementById('installmentOptionsContainer').innerHTML = '<p>Aguardando...</p>';
    const btnNext4 = document.getElementById('btnNext4');
    if(btnNext4) btnNext4.disabled = true;
    
    document.getElementById('whatsappMessageFinal').value = '';
    const preSendInfo = document.getElementById('preSendInfo');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage');
    const screenTitle = document.getElementById('screen5Title'); // Pegando pelo ID

    if(preSendInfo) preSendInfo.style.display = 'block';
    if (whatsappTextarea) whatsappTextarea.style.display = 'block';
    if (sendButton) sendButton.style.display = 'block'; 
    if (prevButton) prevButton.style.display = 'block'; 
    if (feedbackDiv) feedbackDiv.style.display = 'none';
    if (screenTitle) screenTitle.innerHTML = '<i class="fas fa-paper-plane"></i> Preparar para Enviar';
    
    initializeScreen1();
    showScreen(1);
}

document.getElementById('clientName').addEventListener('input', (event) => {
    appData.client.name = event.target.value.trim();
    checkScreen1Completion();
});
