// ############## IMPORTANTE ##############
// URL DA SUA API DO GOOGLE SHEET (VERIFIQUE E ATUALIZE SE NECESSÁRIO)
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbwhsTtOPvSFBzi86nlSaW8a4QHD-UmBD46ZJdy7yUnyLwjOl4q9fyulwBa4-vNRaxjm/exec';
const WHATSAPP_NUMBER = '44998408460'; // SEU NÚMERO DO WHATSAPP
const CONFIG_PASSWORD = 'Angelik@2025'; // SENHA DE ACESSO À CONFIGURAÇÃO
const LOCAL_STORAGE_RATES_KEY = 'financingCalculatorRates'; // Chave para Local Storage
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
        percentageForFixed: 0, // Used for '10', '20', '30' types
        customAmountRaw: 0, // Value entered by user for 'custom'
        calculatedAmount: 0, // Final rounded entry amount
        effectivePercentage: 0 // calculatedAmount / TotalWithWarranty
    },
    warranty: { type: 'none', percentageValue: 0 },
    financing: {
        amountForInstallmentCalculation: 0, // TotalWithWarranty - calculatedEntry
        selectedInstallment: null, // { months, value, totalPaid }
        // Default monthly rates (as decimals) - these will be loaded/overwritten from LocalStorage
        monthlyInterestRates: {
            noEntry:    0.14, // < 10% effective entry
            entry10pct: 0.12, // 10% to < 20% effective entry
            entry20pct: 0.10, // 20% to < 30% effective entry
            entry30pct: 0.08, // 30% to < 40% effective entry
            entry40pct: 0.06, // 40% to < 50% effective entry
            entry50plus: 0.04  // 50%+ effective entry
        },
        currentMonthlyRate: 0 // The actual monthly rate selected based on effective entry
    },
    feedbackMessage: ''
};

function roundUpToNearest5(num) {
    if (typeof num !== 'number' || isNaN(num) || num <= 0) return 0;
    // Round up to the nearest 5, ensuring it works correctly for small values
     // Example: 1.23 -> 5, 6.78 -> 10, 0 -> 0, 4.99 -> 5
     return Math.max(0, Math.ceil(num / 5) * 5);
}

// --- Local Storage and Configuration Modal Functions ---

function loadRatesFromStorage() {
    const savedRates = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
    if (savedRates) {
        try {
            const parsedRates = JSON.parse(savedRates);
            const defaultKeys = Object.keys(appData.financing.monthlyInterestRates);
            let isValid = true;
            // Check if all expected keys are present and values are valid numbers
            if (Object.keys(parsedRates).length !== defaultKeys.length) {
                 isValid = false;
                 console.warn("Loaded rates object has incorrect number of keys.");
            }
            if (isValid) {
                for (const key of defaultKeys) {
                    if (typeof parsedRates[key] !== 'number' || isNaN(parsedRates[key])) {
                        isValid = false;
                        console.warn(`Loaded rate for key "${key}" is not a valid number.`);
                        break;
                    }
                }
            }

            if (isValid) {
                appData.financing.monthlyInterestRates = parsedRates;
                console.log("Rates loaded from Local Storage.");
            } else {
                console.warn("Invalid rates data found in Local Storage. Using default rates.");
                // Optionally clear bad data: localStorage.removeItem(LOCAL_STORAGE_RATES_KEY);
            }
        } catch (e) {
            console.error("Error parsing rates from Local Storage:", e);
            // Optionally clear bad data: localStorage.removeItem(LOCAL_STORAGE_RATES_KEY);
        }
    } else {
        console.log("No rates found in Local Storage. Using default rates.");
    }
    // Ensure appData's current rate is set based on the initial state (no entry)
    // This will be correctly updated by updateAllCalculationsAndUI later on screen 3 load
    appData.financing.currentMonthlyRate = appData.financing.monthlyInterestRates.noEntry;
}

function saveRatesToStorage() {
    try {
        localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(appData.financing.monthlyInterestRates));
        console.log("Rates saved to Local Storage.");
    } catch (e) {
        console.error("Error saving rates to Local Storage:", e);
        alert("Erro ao salvar as taxas no navegador (Local Storage pode estar desabilitado ou cheio).");
    }
}

function openConfigModal() {
    document.getElementById('configModal').style.display = 'block';
    document.getElementById('passwordArea').style.display = 'block';
    document.getElementById('ratesArea').style.display = 'none';
    document.getElementById('configPassword').value = '';
    document.getElementById('passwordError').style.display = 'none';
}

function closeConfigModal() {
    document.getElementById('configModal').style.display = 'none';
    // Clear password input on close
    document.getElementById('configPassword').value = '';
     // Hide password area again for next open
     document.getElementById('passwordArea').style.display = 'block';
     document.getElementById('ratesArea').style.display = 'none';

}

function checkPassword() {
    const enteredPassword = document.getElementById('configPassword').value;
    const passwordError = document.getElementById('passwordError');
    if (enteredPassword === CONFIG_PASSWORD) {
        passwordError.style.display = 'none';
        document.getElementById('passwordArea').style.display = 'none';
        document.getElementById('ratesArea').style.display = 'block';
        // Populate rate inputs with current rates
        for (const key in appData.financing.monthlyInterestRates) {
             // Map key name (e.g., 'noEntry', 'entry10pct') to input ID (e.g., 'rateNoEntry', 'rateEntry10pct')
            const inputId = 'rate' + key.charAt(0).toUpperCase() + key.slice(1);
            const input = document.getElementById(inputId);
            if (input) {
                input.value = appData.financing.monthlyInterestRates[key].toFixed(4); // Show with 4 decimal places
            } else {
                console.warn(`Config input element not found for key: ${key}, expected ID: ${inputId}`);
            }
        }
    } else {
        passwordError.textContent = 'Senha incorreta.';
        passwordError.style.display = 'block';
        document.getElementById('configPassword').value = ''; // Clear password on failure
    }
}

function saveRates() {
    const newRates = {};
    let hasError = false;
    const rateKeys = Object.keys(appData.financing.monthlyInterestRates); // Use keys from appData structure

    for (const key of rateKeys) {
         const inputId = 'rate' + key.charAt(0).toUpperCase() + key.slice(1);
        const input = document.getElementById(inputId);
        if (input) {
            const value = parseFloat(input.value);
            if (isNaN(value) || value < 0) {
                alert(`Por favor, insira um valor numérico positivo para a taxa da faixa "${key.replace('entry', 'Entrada ').replace('pct', '%').replace('plus', '+').replace('noEntry', 'Sem Entrada')}".`);
                hasError = true;
                break;
            }
            newRates[key] = value;
        } else {
            console.error(`Config input element not found during save for key: ${key}, expected ID: ${inputId}`);
            hasError = true;
            break;
        }
    }

    if (!hasError) {
        appData.financing.monthlyInterestRates = newRates;
        saveRatesToStorage();
        alert('Taxas salvas com sucesso!');
        closeConfigModal();
        // Re-calculate everything if rates changed while on a screen that shows financials (3, 4, 5)
        if (currentScreen >= 3) {
             updateAllCalculationsAndUI();
        }
    }
}


// --- Initial Setup ---
document.addEventListener('DOMContentLoaded', () => {
    loadRatesFromStorage(); // Load rates first

    // Event listeners for config modal buttons
    const openConfigBtn = document.getElementById('openConfigBtn');
    if(openConfigBtn) {
        openConfigBtn.addEventListener('click', openConfigModal);
    }
    const closeConfigBtn = document.querySelector('#configModal .close-button');
     if(closeConfigBtn) {
         closeConfigBtn.addEventListener('click', closeConfigModal);
     }
    const checkPasswordBtn = document.querySelector('#passwordArea button');
     if(checkPasswordBtn) {
         checkPasswordBtn.addEventListener('click', checkPassword);
     }
     const saveRatesBtn = document.querySelector('#ratesArea button');
     if(saveRatesBtn) {
         saveRatesBtn.addEventListener('click', saveRates);
     }
     const configPasswordInput = document.getElementById('configPassword');
      if(configPasswordInput) {
          configPasswordInput.addEventListener('keypress', function(event) {
               if (event.key === 'Enter') {
                  event.preventDefault(); // Prevent form submission (if it were in a form)
                  checkPassword();
               }
          });
      }


    initializeScreen1();
    showScreen(1);
    updateProgressBar(1);

    const cpfInput = document.getElementById('clientCpf');
    if (cpfInput) {
         cpfInput.addEventListener('input', maskCPF);
         cpfInput.addEventListener('change', (event) => { // Also check on change/paste
             maskCPF({ target: event.target });
             checkScreen1Completion();
         });
    }

    const clientNameInput = document.getElementById('clientName');
    if(clientNameInput) {
         clientNameInput.addEventListener('input', () => {
              appData.client.name = clientNameInput.value.trim();
              checkScreen1Completion();
         });
    }

    const customEntryInput = document.getElementById('customEntryAmountInput');
    if(customEntryInput) customEntryInput.addEventListener('input', handleCustomEntryValueChange);

    // Add event listeners for option items (Entry, Warranty) - Using delegation or direct attach
    // Direct attach on DOMContentLoaded is fine given the structure
     document.querySelectorAll('.entry-options .option-item').forEach(item => {
        const radio = item.querySelector('input[type="radio"]');
        if (radio) {
            item.addEventListener('click', () => {
                 // Simulate radio click behavior if clicking the div/label
                 radio.checked = true;
                 selectEntryOption(radio.value, item);
            });
            // Also listen for actual radio change in case of keyboard or other input methods
             radio.addEventListener('change', () => {
                 if (radio.checked) selectEntryOption(radio.value, item);
             });
        }
    });

    document.querySelectorAll('.warranty-options .option-item').forEach(item => {
        const radio = item.querySelector('input[type="radio"]');
        if (radio) {
             item.addEventListener('click', () => {
                 // Simulate radio click behavior
                 radio.checked = true;
                 selectWarrantyOption(radio.value, item);
             });
             radio.addEventListener('change', () => {
                 if (radio.checked) selectWarrantyOption(radio.value, item);
             });
        }
    });

    // Add event listener for Payment Day Options - Using delegation
    const paymentDayOptionsContainer = document.getElementById('paymentDayOptionsContainer');
     if (paymentDayOptionsContainer) {
         paymentDayOptionsContainer.addEventListener('click', function(event) {
              const optionItem = event.target.closest('.option-item');
              if (optionItem) {
                   const radio = optionItem.querySelector('input[type="radio"]');
                   if (radio) {
                        // Simulate radio click behavior
                        radio.checked = true;
                        selectPaymentDate(radio.value, optionItem);
                   }
              }
         });
     }
     // Also listen for actual radio change in case of keyboard or other input methods
     document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => {
         radio.addEventListener('change', function() {
             if (this.checked) {
                 const optionItem = this.closest('.option-item');
                 selectPaymentDate(this.value, optionItem);
             }
         });
     });


    // Add event listeners for screen 2 buttons (Search and Add)
    const btnFetchProduct = document.getElementById('btnFetchProduct');
    if(btnFetchProduct) btnFetchProduct.addEventListener('click', fetchProductBySku);

    const btnAddProductToList = document.getElementById('btnAddProductToList');
    if(btnAddProductToList) btnAddProductToList.addEventListener('click', addProductToListAndClearSearch);

    // Add event listener for Screen 5 WhatsApp button
     const sendWppButton = document.getElementById('sendWppButton');
     if(sendWppButton) sendWppButton.addEventListener('click', sendWhatsAppMessage);

});

// --- Screen 1 Functions ---

function initializeScreen1() {
    const today = new Date();
    // Use the formatDateForDisplay which handles the UTC to DD/MM/YYYY conversion
    appData.order.currentDate = formatDateForDisplay(formatDateForInput(today));
    document.getElementById('currentDate').textContent = appData.order.currentDate;

    generatePaymentDayOptions(); // Gera as opções de dia

    // Reseta os campos da tela 1 (mantém valores se já existiam para restart)
    document.getElementById('clientName').value = appData.client.name;
    document.getElementById('clientCpf').value = appData.client.cpf;

    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    const firstInstallmentDateSpan = document.getElementById('firstInstallmentDateInfo');
    const daysToFirstInstallmentSpan = document.getElementById('daysToFirstInstallment');

    // Limpa seleção de data visual e dados
    appData.order.paymentDate = '';
    appData.order.firstInstallmentDate = '';
    appData.order.daysToFirstInstallment = 0;
    document.getElementById('selectedPaymentDateHidden').value = '';
    // Remove 'selected' class from all option items
    document.querySelectorAll('#paymentDayOptionsContainer .option-item').forEach(el => el.classList.remove('selected'));
    // Uncheck all radio buttons
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false);


    if (firstInstallmentDateSpan) firstInstallmentDateSpan.textContent = 'A definir';
    if (daysToFirstInstallmentSpan) daysToFirstInstallmentSpan.textContent = 'A definir';
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none';

    checkScreen1Completion(); // Verifica se o botão deve estar habilitado
}

function generatePaymentDayOptions() {
    const container = document.getElementById('paymentDayOptionsContainer');
    if (!container) return;
    container.innerHTML = ''; // Clear existing options

    const today = new Date(); // Data local
    const currentDayUTC = today.getUTCDate();
    const currentMonthUTC = today.getUTCMonth();
    const currentYearUTC = today.getUTCFullYear();

    // Calculate the limit date (today + 33 days) in UTC
    const limitDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 33)); // 33 DAYS LIMIT

    const fixedDays = [5, 10, 15, 20, 25, 30];
    let optionsGenerated = 0;
    const addedDates = new Set(); // To avoid duplicates

    // Try current month and next month
    for (let monthOffset = 0; monthOffset < 2 && optionsGenerated < 8; monthOffset++) {
        const targetMonth = currentMonthUTC + monthOffset;
        const year = currentYearUTC + Math.floor(targetMonth / 12);
        const month = targetMonth % 12;

        fixedDays.forEach(day => {
            if (optionsGenerated >= 8) return; // Stop after generating 8 options

            // Create date in UTC
            const paymentDateAttempt = new Date(Date.UTC(year, month, day));

            // Check if the date is valid for the month (e.g., no Feb 30)
            if (paymentDateAttempt.getUTCDate() !== day) {
                return;
            }

            // Minimum selectable date is tomorrow (in UTC)
            const minSelectableDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 1));

            // Check if the date is within the allowed range (tomorrow up to limitDate)
            if (paymentDateAttempt.getTime() >= minSelectableDate.getTime() &&
                paymentDateAttempt.getTime() <= limitDate.getTime()) {

                const dateStr = formatDateForInput(paymentDateAttempt); // YYYY-MM-DD
                if (addedDates.has(dateStr)) return; // Avoid adding duplicate dates
                addedDates.add(dateStr);

                const optionDiv = document.createElement('div');
                optionDiv.classList.add('option-item');
                // Using radio input for accessibility and state management
                optionDiv.innerHTML = `<input type="radio" name="paymentDay" id="dayOpt${dateStr}" value="${dateStr}">
                                       <label for="dayOpt${dateStr}">${formatDateForDisplay(dateStr)}</label>`;
                // Event listener is added via delegation in DOMContentLoaded

                container.appendChild(optionDiv);
                optionsGenerated++;
            }
        });
    }
     // If after trying 2 months, still less than 8 options, try the month after next
     if (optionsGenerated < 8) {
          const targetMonth = currentMonthUTC + 2;
          const year = currentYearUTC + Math.floor(targetMonth / 12);
          const month = targetMonth % 12;

          fixedDays.forEach(day => {
               if (optionsGenerated >= 8) return;

               const paymentDateAttempt = new Date(Date.UTC(year, month, day));
                if (paymentDateAttempt.getUTCDate() !== day) return; // Invalid date

                const minSelectableDate = new Date(Date.UTC(currentYearUTC, currentMonthUTC, currentDayUTC + 1));

               if (paymentDateAttempt.getTime() >= minSelectableDate.getTime() &&
                   paymentDateAttempt.getTime() <= limitDate.getTime()) {

                   const dateStr = formatDateForInput(paymentDateAttempt);
                   if (addedDates.has(dateStr)) return;
                   addedDates.add(dateStr);

                   const optionDiv = document.createElement('div');
                   optionDiv.classList.add('option-item');
                   optionDiv.innerHTML = `<input type="radio" name="paymentDay" id="dayOpt${dateStr}" value="${dateStr}">
                                          <label for="dayOpt${dateStr}">${formatDateForDisplay(dateStr)}</label>`;
                   container.appendChild(optionDiv);
                   optionsGenerated++;
               }
          });
     }
    // Re-attach change listeners to newly added radios
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => {
         radio.addEventListener('change', function() {
             if (this.checked) {
                 const optionItem = this.closest('.option-item');
                 selectPaymentDate(this.value, optionItem);
             }
         });
     });
}


function selectPaymentDate(dateStr, element) {
    // Ensure all other options are not selected
    document.querySelectorAll('#paymentDayOptionsContainer .option-item').forEach(el => el.classList.remove('selected'));
    // Add selected class to the clicked/changed element
    if (element) { // Element might be null if triggered by radio change directly
         element.classList.add('selected');
         // Ensure the corresponding radio is checked if clicking the div/label
         const radio = element.querySelector('input[type="radio"]');
         if (radio) radio.checked = true;
    }

    // Store the selected date string
    document.getElementById('selectedPaymentDateHidden').value = dateStr;
    appData.order.paymentDate = dateStr;
    appData.order.firstInstallmentDate = dateStr; // First installment is the payment date

    // Display the selected date
    document.getElementById('firstInstallmentDateInfo').textContent = formatDateForDisplay(dateStr);

    // Calculate days until first installment
    const today = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())); // Today's date in UTC
    const paymentDParts = dateStr.split('-');
    const paymentD = new Date(Date.UTC(parseInt(paymentDParts[0]), parseInt(paymentDParts[1])-1, parseInt(paymentDParts[2]))); // Payment date in UTC

    const diffTime = paymentD.getTime() - today.getTime();
    // Calculate difference in days, rounding up, ensure minimum is 0
    appData.order.daysToFirstInstallment = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    document.getElementById('daysToFirstInstallment').textContent = `${appData.order.daysToFirstInstallment} dia(s)`;

    // Show the details box
    document.getElementById('paymentDateDetails').style.display = 'block';

    // Check completion for screen 1
    checkScreen1Completion();
}


function maskCPF(event) {
    let cpf = event.target.value.replace(/\D/g, '');
    if (cpf.length > 11) cpf = cpf.substring(0, 11); // Max 11 digits
    let maskedCpf = '';
    if (cpf.length <= 3) maskedCpf = cpf;
    else if (cpf.length <= 6) maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3)}`;
    else if (cpf.length <= 9) maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6)}`;
    else maskedCpf = `${cpf.substring(0, 3)}.${cpf.substring(3, 6)}.${cpf.substring(6, 9)}-${cpf.substring(9)}`;
    event.target.value = maskedCpf;
    appData.client.cpf = maskedCpf; // Store the masked value
    checkScreen1Completion();
}

function checkScreen1Completion() {
    const name = document.getElementById('clientName').value.trim();
    // Check if CPF is valid (11 digits after removing mask) and has the full mask length
    const cpf = appData.client.cpf; // Use the stored masked CPF
    const rawCpf = cpf.replace(/\D/g, '');
    const paymentDate = appData.order.paymentDate;
    // Button is enabled only if name is not empty, rawCpf has exactly 11 digits, and a payment date is selected
    document.getElementById('btnNext1').disabled = !(name && rawCpf.length === 11 && paymentDate);
}

function formatDateForInput(date) { // Recebe objeto Date (assume UTC data)
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForDisplay(dateString) { // Recebe string YYYY-MM-DD
    if (!dateString) return 'N/A';
    const dateParts = dateString.split('-');
    if (dateParts.length === 3) {
        // Create date in UTC for consistency
        const date = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
        const day = String(date.getUTCDate()).padStart(2, '0');
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }
    return dateString; // Return as is if not YYYY-MM-DD format
}

function showScreen(screenNumber) {
    document.querySelectorAll('.screen').forEach(screen => screen.style.display = 'none');
    const nextScreenElement = document.getElementById(`screen${screenNumber}`);
    if (nextScreenElement) nextScreenElement.style.display = 'block';
    currentScreen = screenNumber;
    updateProgressBar(screenNumber);

    // Run screen-specific initializations or updates when showing a screen
     if (screenNumber === 3) {
          // When entering screen 3, ensure entry placeholders and calculations are updated
         updateEntryPlaceholders();
         updateAllCalculationsAndUI(); // This also generates installment options for screen 4
          // Ensure entry info box visibility is correct on screen load
         const entryResultInfoBox = document.getElementById('entryResultInfoBox');
         if (entryResultInfoBox) {
              // Show if not 'none' type, or if 'custom' with calculated amount > 0
              if (appData.entry.type !== 'none' || (appData.entry.type === 'custom' && appData.entry.calculatedAmount > 0)) {
                  entryResultInfoBox.style.display = 'block';
              } else {
                  entryResultInfoBox.style.display = 'none';
              }
         }
     } else if (screenNumber === 4) {
         // When entering screen 4, ensure installment options are generated and button state is correct
         // updateAllCalculationsAndUI was called on screen 3 exit, but let's be safe
         // updateAllCalculationsAndUI(); // Can be redundant but ensures freshness
         generateInstallmentOptions(); // Regenerate options based on current state
          // Check initial button state for screen 4
          const btnNext4 = document.getElementById('btnNext4');
           if(btnNext4) {
                // Disable if financing is needed (>0) and no option is selected
               btnNext4.disabled = (appData.financing.amountForInstallmentCalculation > 0 && !appData.financing.selectedInstallment);
               // Enable if no financing is needed (<=0) but products exist
                if (appData.financing.amountForInstallmentCalculation <= 0 && appData.baseTotalAmount > 0) {
                    btnNext4.disabled = false;
                }
                // Disable if no products exist
                 if (appData.baseTotalAmount === 0) {
                     btnNext4.disabled = true;
                 }
           }

     } else if (screenNumber === 5) {
         // When entering screen 5, prepare the summary
         prepareSummaryAndWhatsApp();
          // Ensure summary container and message area are visible initially on screen 5
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
          if (feedbackDiv) feedbackDiv.style.display = 'none'; // Feedback is hidden until sent
          if (screen5Title) screen5Title.innerHTML = '<i class="fas fa-file-alt"></i> Resumo da Simulação'; // Reset title
     }
}

function updateProgressBar(screenNumber) {
    const totalSteps = 5;
    for (let i = 1; i <= totalSteps; i++) {
        // Use the correct class name: progress-step
        const step = document.getElementById(`step${i}`);
        if (!step) continue;
        step.classList.remove('active', 'completed');
        step.textContent = i; // Reset text content first

        if (i < screenNumber) {
            step.classList.add('completed');
            step.textContent = '✓'; // Use checkmark for completed
        } else if (i === screenNumber) {
            step.classList.add('active');
        }
    }
}

function nextScreen(currentScreenNum) {
    // Validation is handled by the validateScreen function called inside this function
    // The button's disabled state also helps prevent invalid transitions

    // Specific actions/updates before leaving the screen
    if (currentScreenNum === 1) {
        appData.client.name = document.getElementById('clientName').value.trim();
         // Validation happens at the start of the function
    } else if (currentScreenNum === 2) {
        // Validation happens at the start. No specific data to save from UI.
         // updateEntryPlaceholders and updateAllCalculationsAndUI are called when Screen 3 is shown
    } else if (currentScreenNum === 3) {
        // updateAllCalculationsAndUI was already called when entering screen 3 or on option changes
        // It also generates installment options for screen 4
         // Validation happens at the start.
    } else if (currentScreenNum === 4) {
         // prepareSummaryAndWhatsApp is called when Screen 5 is shown
         // Validation happens at the start.
    }


    // Validate the current screen's data/state before moving
    if (!validateScreen(currentScreenNum)) {
         console.log(`Validation failed for screen ${currentScreenNum}`);
        return; // Stop if validation fails
    }

    // Move to the next screen
    if (currentScreenNum < 5) {
        showScreen(currentScreenNum + 1);
    }
}

function prevScreen(currentScreenNum) {
    if (currentScreenNum > 1) {
        showScreen(currentScreenNum - 1);
    }
}

function validateScreen(screenNumber) {
    if (screenNumber === 1) {
        const name = document.getElementById('clientName').value.trim();
        const rawCpf = appData.client.cpf.replace(/\D/g, ''); // Get raw digits
        const paymentDate = appData.order.paymentDate;
         // Check for non-empty name, exactly 11 digits in CPF, and selected payment date
        if (!name || rawCpf.length !== 11 || !paymentDate) {
            alert("Por favor, preencha Nome, CPF válido (11 dígitos) e selecione uma Data de Pagamento.");
            return false;
        }
    }
    if (screenNumber === 2) {
        if (appData.products.length === 0) {
             alert('Adicione pelo menos um produto.');
            return false;
        }
    }
     if (screenNumber === 3) {
        // Validation for custom entry maximum amount is handled and corrected within updateAllCalculationsAndUI.
        // It prevents calculating a financed amount less than zero.
        // No explicit validation is needed here unless there are other constraints.
         // Example: You could add a check here if minimum entry is required.
         // if (appData.entry.calculatedAmount < 50 && appData.financing.amountForInstallmentCalculation > 0) { alert("Entrada mínima é R$ 50"); return false; }
    }
    if (screenNumber === 4) {
        const amountToFinance = appData.financing.amountForInstallmentCalculation;
        const selectedInstallment = appData.financing.selectedInstallment;

         // If there's a positive amount to finance, an installment *must* be selected
        if (amountToFinance > 0 && !selectedInstallment) {
            alert('Selecione uma opção de parcelamento para continuar.');
            return false;
        }
         // If amount to finance is 0 or less, it's valid to proceed without selecting installment
         // This covers cases where entry covers the total.
         if (amountToFinance <= 0 && appData.baseTotalAmount > 0) {
             return true; // Valid even if no installment selected
         }
         // If no products added (baseTotalAmount is 0), validation should fail.
         // This state should ideally not be reachable if screen 2 validation works, but adding defensively.
         if (appData.baseTotalAmount === 0) {
             alert('Por favor, adicione produtos na Tela 2 primeiro.');
             return false;
         }
    }
    // If none of the specific screen validations fail, it's valid to proceed
    return true;
}

// --- Screen 2 Functions (Product Search & List) ---

async function fetchProductBySku() {
    const skuInput = document.getElementById('productSku');
    const sku = skuInput.value.trim().toUpperCase();
    const displayDiv = document.getElementById('productFetchDisplay'); // This is an info-box now
    const nameDisplay = document.getElementById('fetchedProductNameDisplay');
    const priceDisplay = document.getElementById('fetchedProductPriceDisplay');
    const nameHidden = document.getElementById('productNameHidden');
    const valueHidden = document.getElementById('productValueHidden');
    const btnAdd = document.getElementById('btnAddProductToList');
    const btnFetch = document.getElementById('btnFetchProduct');

    if (!sku) { alert('Por favor, insira um SKU para buscar.'); return; }

    // Show loading state
    btnFetch.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';
    btnFetch.disabled = true;
    displayDiv.style.display = 'none'; // Hide previous result
    btnAdd.disabled = true; // Disable add button

    try {
        const response = await fetch(`${GOOGLE_SHEET_API_URL}?sku=${encodeURIComponent(sku)}`);
        if (!response.ok) {
            // Try to read error message from response body
            let errorDetail = `Erro HTTP: ${response.status}`;
            try {
                const errBody = await response.json();
                if (errBody && errBody.error) errorDetail = `API Error: ${errBody.error}`;
            } catch(e) { /* ignore json parsing error */ }
            throw new Error(errorDetail);
        }
        const data = await response.json(); // Assuming the API returns JSON

        if (data && data.found) {
            nameDisplay.textContent = data.name;
            priceDisplay.textContent = parseFloat(data.price).toFixed(2); // Ensure price is formatted
            nameHidden.value = data.name;
            valueHidden.value = parseFloat(data.price);
            displayDiv.style.display = 'block'; // Show product details
            btnAdd.disabled = false; // Enable add button
        } else {
            // Product not found or API returned 'found: false'
            alert(data.error || `SKU "${sku}" não encontrado.`);
            displayDiv.style.display = 'none'; // Hide display if not found
        }
    } catch (error) {
        console.error('Error fetching SKU:', error);
        alert(`Erro ao buscar produto: ${error.message}`);
        displayDiv.style.display = 'none'; // Hide display on error
    } finally {
        // Reset search button
        btnFetch.innerHTML = '<i class="fas fa-search"></i> Buscar';
        btnFetch.disabled = false;
    }
}

function addProductToListAndClearSearch() {
    const name = document.getElementById('productNameHidden').value;
    const value = parseFloat(document.getElementById('productValueHidden').value);
    const addedMessage = document.getElementById('productAddedMessage'); // Success feedback element

    // Validate the product data before adding
    if (name && !isNaN(value) && value > 0) {
        // Add product to the appData array
        appData.products.push({ id: Date.now(), name, value }); // Use timestamp as unique ID
        console.log("Product added:", { name, value });

        // Update the product list display and total amount
        updateProductVisor();

        // Clear the search area
        document.getElementById('productSku').value = '';
        document.getElementById('productFetchDisplay').style.display = 'none'; // Hide product details
        document.getElementById('btnAddProductToList').disabled = true; // Disable add button

        // Show success message
        if(addedMessage) {
            addedMessage.style.display = 'block';
            setTimeout(() => { addedMessage.style.display = 'none'; }, 2000); // Hide after 2 seconds
        }

    } else {
        alert('Não foi possível adicionar o produto. Dados inválidos.');
    }
}

function updateProductVisor() {
    const visor = document.getElementById('productsAddedVisor'); // Visor area
    const totalDisplay = document.getElementById('totalProductsAmountVisor'); // Span for total amount
    visor.innerHTML = ''; // Clear current list in the visor
    appData.baseTotalAmount = 0; // Reset total

    if (appData.products.length === 0) {
        // Show placeholder message if list is empty
        visor.innerHTML = '<p>Nenhum produto adicionado.</p>';
        document.getElementById('btnNext2').disabled = true; // Disable next if no products
    } else {
        // Populate the visor with current products
        appData.products.forEach((p, index) => {
            appData.baseTotalAmount += p.value; // Sum up total amount
            const item = document.createElement('div');
            item.classList.add('product-item-visor');
            item.innerHTML = `<span class="product-name">${p.name}</span>
                              <span class="product-price">R$ ${p.value.toFixed(2)}</span>
                              <button class="remove-product-visor" data-index="${index}" title="Remover"><i class="fas fa-times-circle"></i></button>`;
            visor.appendChild(item);
        });
        document.getElementById('btnNext2').disabled = false; // Enable next if products exist

        // Add event listeners to remove buttons
        visor.querySelectorAll('.remove-product-visor').forEach(button => {
            button.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                removeProductFromVisor(index);
            });
        });
    }

    // Update the total amount display
    totalDisplay.textContent = appData.baseTotalAmount.toFixed(2);
    console.log("Total products amount:", appData.baseTotalAmount);

    // Recalculate everything affected by the product list/total
    updateEntryPlaceholders(); // Entry placeholders depend on base total (+ warranty)
    updateAllCalculationsAndUI(); // Recalculate entry value, financed amount, and installment options
}

function removeProductFromVisor(index) {
    // Remove the product from the array using its index
    if (index >= 0 && index < appData.products.length) {
        const removedProductName = appData.products[index].name;
        appData.products.splice(index, 1); // Remove 1 element at the specified index
        console.log(`Product removed at index ${index}: ${removedProductName}`);

        // Update the display and recalculate after removal
        updateProductVisor();
    }
}

// --- Screen 3 Functions (Entry & Warranty) ---

function updateEntryPlaceholders() {
    // Placeholders show the calculated R$ value based on the *current* total + warranty
    const totalValueForPlaceholders = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);
    document.querySelectorAll('.entry-options .entry-value-placeholder').forEach(span => {
        const pct = parseFloat(span.dataset.pct);
        if (!isNaN(pct)) {
            // Calculate and display the rounded value
            const placeholderValue = roundUpToNearest5(totalValueForPlaceholders * pct);
            span.textContent = `R$ ${placeholderValue.toFixed(2)}`;
        }
    });
}

function selectEntryOption(type, element) {
    appData.entry.type = type;
    const customGroup = document.getElementById('customEntryValueGroup');
    const customInput = document.getElementById('customEntryAmountInput');
    const entryResultInfoBox = document.getElementById('entryResultInfoBox'); // Info box below entry options

    // Remove 'selected' class from all options
    document.querySelectorAll('.entry-options .option-item').forEach(el => el.classList.remove('selected'));
    // Add 'selected' class to the clicked/changed element
    if (element) {
        element.classList.add('selected');
        // Ensure the corresponding radio is checked
        const radio = element.querySelector('input[type="radio"]');
         if (radio) radio.checked = true;
    } else { // Case for initialization or restart
         const correspondingElement = document.querySelector(`.entry-options .option-item input[value="${type}"]`);
         if (correspondingElement) {
              correspondingElement.checked = true;
              correspondingElement.closest('.option-item').classList.add('selected');
         }
    }


    if (type === 'custom') {
        customGroup.style.display = 'block';
        // Keep existing custom amount value if it exists, formatted to 2 decimals
        customInput.value = appData.entry.customAmountRaw > 0 ? appData.entry.customAmountRaw.toFixed(2) : '';
        // Trigger recalculation based on the value currently in the custom input
        handleCustomEntryValueChange();
    } else {
        customGroup.style.display = 'none';
        appData.entry.customAmountRaw = 0; // Reset raw custom amount if changing option
        // Set percentage for fixed options ('10', '20', '30', 'none')
        appData.entry.percentageForFixed = (type === 'none') ? 0 : parseInt(type) / 100;
        // Recalculate based on fixed percentage
        updateAllCalculationsAndUI();
    }

    // Control visibility of the info box below entry options
     if (entryResultInfoBox) {
         // Show info box if the selected type is not 'none' OR if it's 'custom' and there's a calculated amount > 0
         if (type !== 'none' || (type === 'custom' && appData.entry.calculatedAmount > 0)) {
             entryResultInfoBox.style.display = 'block';
         } else {
             entryResultInfoBox.style.display = 'none';
         }
     }
}

function handleCustomEntryValueChange() {
    if (appData.entry.type === 'custom') {
        // Get the value from the input, clean it up, and parse as a number
        let rawValue = document.getElementById('customEntryAmountInput').value.replace(',', '.'); // Replace comma with dot for parsing
        const numericValue = parseFloat(rawValue);

        // Store the raw numeric value (or 0 if invalid/negative)
        appData.entry.customAmountRaw = isNaN(numericValue) || numericValue < 0 ? 0 : numericValue;

        // Recalculate based on the new raw custom amount
        updateAllCalculationsAndUI();

         // Update info box visibility after recalculation
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
    // Map type string to percentage value
    const percentages = {'none':0, '6':0.05, '12':0.10, '18':0.15, '24':0.20};
    appData.warranty.percentageValue = percentages[type] || 0; // Default to 0 if type is not found

    // Update UI selection state
    document.querySelectorAll('.warranty-options .option-item').forEach(el => el.classList.remove('selected'));
    if (element) {
        element.classList.add('selected');
         // Ensure the corresponding radio is checked
        const radio = element.querySelector('input[type="radio"]');
         if (radio) radio.checked = true;
    } else { // Case for initialization or restart
         const correspondingElement = document.querySelector(`.warranty-options .option-item input[value="${type}"]`);
         if (correspondingElement) {
              correspondingElement.checked = true;
              correspondingElement.closest('.option-item').classList.add('selected');
         }
    }

    // Recalculate everything as total value and amount to finance might change
    updateAllCalculationsAndUI();
    // Update entry placeholders as their R$ value depends on total + warranty
    updateEntryPlaceholders();
}

// --- Main Calculation Logic (using Monthly Compound Interest - Tabela Price) ---

function updateAllCalculationsAndUI() {
    // Calculate total amount including the effect of warranty percentage
    const totalWithWarrantyEffect = appData.baseTotalAmount * (1 + appData.warranty.percentageValue);

    // --- Cálculo da Entrada ---
    if (appData.entry.type === 'custom') {
        // Calculate the final entry amount by rounding the raw custom amount
        appData.entry.calculatedAmount = roundUpToNearest5(appData.entry.customAmountRaw);
        // Ensure the calculated entry amount does not exceed the total with warranty effect
        if (appData.entry.calculatedAmount > totalWithWarrantyEffect && totalWithWarrantyEffect > 0) {
            // Cap the calculated entry to the total with warranty effect, and round it
            appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect);
             // Optionally update the custom input field to show the capped amount
             const customInput = document.getElementById('customEntryAmountInput');
             if (customInput && parseFloat(customInput.value) !== appData.entry.calculatedAmount) {
                  customInput.value = appData.entry.calculatedAmount.toFixed(2);
             }
        } else if (totalWithWarrantyEffect === 0) {
            // If total is zero, entry must be zero
            appData.entry.calculatedAmount = 0;
        }
    } else if (appData.entry.type !== 'none') { // For fixed percentage options ('10', '20', '30')
        // Calculate entry based on fixed percentage of total with warranty, and round it
        appData.entry.calculatedAmount = roundUpToNearest5(totalWithWarrantyEffect * appData.entry.percentageForFixed);
    } else { // For 'none' entry
        appData.entry.calculatedAmount = 0;
    }

     // Final check to prevent calculated amount exceeding total (could happen with precision/rounding)
    if (totalWithWarrantyEffect > 0 && appData.entry.calculatedAmount > totalWithWarrantyEffect) {
         appData.entry.calculatedAmount = totalWithWarrantyEffect;
    }


    // Calculate the effective percentage of the entry relative to the total with warranty effect
    appData.entry.effectivePercentage = totalWithWarrantyEffect > 0 ? (appData.entry.calculatedAmount / totalWithWarrantyEffect) : 0;


    // Update the displayed entry value
    document.getElementById('finalEntryValueDisplay').textContent = appData.entry.calculatedAmount.toFixed(2);

    // --- Calculate the Amount to Finance ---
    appData.financing.amountForInstallmentCalculation = totalWithWarrantyEffect - appData.entry.calculatedAmount;
    // Ensure amount to finance is not negative
    if (appData.financing.amountForInstallmentCalculation < 0) {
        appData.financing.amountForInstallmentCalculation = 0;
    }
    // Update the displayed amount to finance
    document.getElementById('finalAmountToFinanceDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);

    // --- Determine the Monthly Interest Rate based on Effective Entry Percentage ---
    const p = appData.entry.effectivePercentage; // Value between 0 and 1
    const rates = appData.financing.monthlyInterestRates; // Use the loaded/saved rates

    // Select the rate based on the effective percentage thresholds
    if (p < 0.10) appData.financing.currentMonthlyRate = rates.noEntry;
    else if (p < 0.20) appData.financing.currentMonthlyRate = rates.entry10pct;
    else if (p < 0.30) appData.financing.currentMonthlyRate = rates.entry20pct;
    else if (p < 0.40) appData.financing.currentMonthlyRate = rates.entry30pct;
    else if (p < 0.50) appData.financing.currentMonthlyRate = rates.entry40pct;
    else appData.financing.currentMonthlyRate = rates.entry50plus; // 50% or more

    console.log(`Effective Entry Percentage: ${(p*100).toFixed(2)}% -> Using Rate: ${appData.financing.currentMonthlyRate.toFixed(4)} per month`);


    // Update the displayed base amount for installment calculation
    document.getElementById('installmentCalculationBaseDisplay').textContent = appData.financing.amountForInstallmentCalculation.toFixed(2);

    // --- Generate Installment Options ---
    // Clear selected installment as rates/amount may have changed
    const oldSelectedInstallment = appData.financing.selectedInstallment; // Store temporarily
    appData.financing.selectedInstallment = null; // Clear current selection

    // Generate the new list of installment options
    generateInstallmentOptions();

     // Attempt to re-select the old installment if it still exists and its calculated value is close
     if (oldSelectedInstallment) {
         const optionCards = document.querySelectorAll('#installmentOptionsContainer .installment-option-card');
         let foundAndSelected = false;
         optionCards.forEach(card => {
              // Extract months and value from the newly generated card
              const monthsText = card.querySelector('.months').textContent;
              const months = parseInt(monthsText.replace('x', ''));
              const valueText = card.querySelector('.value').textContent;
              const newlyCalculatedValue = parseFloat(valueText.replace('R$', '').trim().replace(',', '.'));

              // Check if this card represents the old selected term
              if (months === oldSelectedInstallment.months) {
                   // Check if the newly calculated PMT for this term is close to the old one
                   if (Math.abs(newlyCalculatedValue - oldSelectedInstallment.value) < 0.005) { // Use a small tolerance for floating point comparison
                        // If the values match, select this card
                        const totalPaid = newlyCalculatedValue * months; // Recalculate total paid with the new PMT
                       selectInstallment(months, newlyCalculatedValue, totalPaid, card);
                       foundAndSelected = true;
                   }
              }
         });
          // If the old selection couldn't be re-selected (rate changed significantly, or term no longer offered),
          // the selectedInstallment remains null, and the next button will be disabled (handled below and in generateInstallmentOptions).
          if (!foundAndSelected) {
               console.log(`Old selection (${oldSelectedInstallment.months}x R$${oldSelectedInstallment.value.toFixed(2)}) no longer valid.`);
          }
     }

    // Update the state of the "Next" button for screen 4 based on whether an installment is selected (if needed)
    const btnNext4 = document.getElementById('btnNext4');
    if(btnNext4) {
         // Disable if financing is needed (> 0) and no option is currently selected
        btnNext4.disabled = (appData.financing.amountForInstallmentCalculation > 0 && !appData.financing.selectedInstallment);
         // Enable if no financing is needed (<= 0) but products exist (user can proceed without installment)
         if (appData.financing.amountForInstallmentCalculation <= 0 && appData.baseTotalAmount > 0) {
             btnNext4.disabled = false;
         }
         // Disable if no products at all
          if (appData.baseTotalAmount === 0) {
             btnNext4.disabled = true;
          }
    }
}

// --- calculatePMT using standard compound interest formula (Tabela Price) ---
function calculatePMT(principal, monthlyRate, numberOfPayments) {
    // Ensure inputs are valid numbers and positive
    if (typeof principal !== 'number' || isNaN(principal) || principal <= 0) return 0;
    if (typeof monthlyRate !== 'number' || isNaN(monthlyRate) || monthlyRate < 0) return 0; // Rate can be 0
    if (typeof numberOfPayments !== 'number' || isNaN(numberOfPayments) || numberOfPayments <= 0) return 0;

    // If rate is 0, PMT is simply principal divided by number of payments
    if (monthlyRate === 0) {
        return principal / numberOfPayments;
    }

    // Standard PMT formula (Tabela Price)
    // PMT = P * [ i * (1 + i)^n ] / [ (1 + i)^n - 1 ]
    // Where:
    // P = Principal (amount to finance)
    // i = Monthly interest rate
    // n = Number of payments (months)

    const i = monthlyRate;
    const n = numberOfPayments;

    // Calculate the compound factor (1 + i)^n
    const compoundFactor = Math.pow(1 + i, n);

    // Avoid division by zero or issues with compoundFactor very close to 1
    if (compoundFactor - 1 === 0) { // This happens if i is effectively zero or n is zero (handled above)
        return principal / numberOfPayments; // Fallback to simple division
    }

    // Calculate PMT
    const pmt = principal * (i * compoundFactor) / (compoundFactor - 1);

    return pmt; // Return the calculated payment amount
}


// --- Screen 4 Functions (Installment Options) ---

function generateInstallmentOptions() {
    const container = document.getElementById('installmentOptionsContainer'); // The grid container
    container.innerHTML = ''; // Clear current options

    const amount = appData.financing.amountForInstallmentCalculation; // Amount to finance
    const monthlyRate = appData.financing.currentMonthlyRate; // Monthly rate based on entry

    const btnNext4 = document.getElementById('btnNext4'); // Button for screen 4

    // Clear selected installment when options are regenerated (already done in updateAllCalculationsAndUI)
    // appData.financing.selectedInstallment = null;
    // if(btnNext4 && amount > 0) { btnNext4.disabled = true; } // Disable until selection (handled in updateAllCalculationsAndUI)


    // Scenario 1: No amount to finance (entry covered total) but products exist
    if (amount <= 0 && appData.baseTotalAmount > 0) {
        container.innerHTML = "<p>A entrada cobre o valor total ou não há valor a financiar. Não há parcelamento.</p>";
        // Next button should be enabled in this case (handled in updateAllCalculationsAndUI)
        // if(btnNext4) btnNext4.disabled = false;
        return; // Exit the function
    }
     // Scenario 2: No products added at all
    if (appData.baseTotalAmount === 0) {
         container.innerHTML = "<p>Adicione produtos na Tela 2 para ver as opções de parcelamento.</p>";
         // Next button should be disabled (handled in updateAllCalculationsAndUI)
         // if(btnNext4) btnNext4.disabled = true;
         return; // Exit the function
    }
     // Scenario 3: Amount to finance > 0 but rate is 0 (possible with config)
     // Handle 1x payment explicitly if rate is zero and amount > 0
     if (amount > 0 && monthlyRate === 0) {
         // Add 1x option
         const pmt1x = amount; // Payment is the full amount
         if (pmt1x > 0) {
              const card1x = document.createElement('div'); card1x.classList.add('installment-option-card');
              card1x.innerHTML = `<div class="months">1x</div>
                                <div class="value">R$ ${pmt1x.toFixed(2)}</div>`;
              const totalPaid1x = pmt1x;
               // Add event listener
               card1x.addEventListener('click', () => selectInstallment(1, pmt1x, totalPaid1x, card1x));
               container.appendChild(card1x);
         }


         // Add other options (3x, 6x, etc.) with 0% rate (simple division)
         const installmentPlansZeroRate = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48];
         let hasOtherZeroRateOptions = false;
         installmentPlansZeroRate.forEach(nper => {
              const pmtZeroRate = amount / nper; // Simple division for 0 rate
              // Only show options if calculated PMT is positive and meets minimum (or is <= 12 months)
              if (pmtZeroRate > 0 && (pmtZeroRate >= 1.00 || nper <= 12)) { // Keep minimum installment rule
                  hasOtherZeroRateOptions = true;
                  const cardZeroRate = document.createElement('div'); cardZeroRate.classList.add('installment-option-card');
                  cardZeroRate.innerHTML = `<div class="months">${nper}x</div>
                                            <div class="value">R$ ${pmtZeroRate.toFixed(2)}</div>`;
                  const totalPaidZeroRate = pmtZeroRate * nper; // Total paid = Principal for 0 rate
                   // Add event listener
                   cardZeroRate.addEventListener('click', () => selectInstallment(nper, pmtZeroRate, totalPaidZeroRate, cardZeroRate));
                   container.appendChild(cardZeroRate);
              }
         });

         let hasAnyOptions = container.children.length > 0;
         if (!hasAnyOptions) {
              container.innerHTML = "<p>Não foi possível gerar opções de parcelamento para o valor financiado (taxa zero).</p>";
              if(btnNext4) btnNext4.disabled = true;
         } else {
             // If options are generated but none selected yet, disable next (unless re-selecting happens later)
              if(btnNext4) btnNext4.disabled = !appData.financing.selectedInstallment;
         }
         return; // Exit after generating 0-rate options
     }


    // Scenario 4: Amount to finance > 0 and monthlyRate > 0 (Standard Tabela Price)
    const installmentPlans = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48];
    let hasCompoundInterestOptions = false;

    installmentPlans.forEach(nper => {
        const pmt = calculatePMT(amount, monthlyRate, nper);
        // Only display options if calculated PMT is positive and meets the minimum value criteria
         // PMT > 0 AND (PMT >= R$1.00 OR number of payments <= 12)
        if (pmt > 0 && (pmt >= 1.00 || nper <= 12)) {
             hasCompoundInterestOptions = true;
             const card = document.createElement('div');
             card.classList.add('installment-option-card');
             card.innerHTML = `<div class="months">${nper}x</div>
                               <div class="value">R$ ${pmt.toFixed(2)}</div>`; // Display PMT formatted
             // Calculate the total amount paid over the term
             const totalPaid = pmt * nper;
             // Add event listener to select this option
             card.addEventListener('click', () => selectInstallment(nper, pmt, totalPaid, card));
             // The 'selected' class is added by the selectInstallment function
             container.appendChild(card);
        }
    });

    // If after checking all terms, no options were generated for amount > 0 & rate > 0
    if (!hasCompoundInterestOptions && amount > 0 && monthlyRate > 0) {
        container.innerHTML = "<p>Não foi possível gerar opções de parcelamento para o valor financiado com a taxa atual.</p>";
         if(btnNext4) btnNext4.disabled = true;
    } else if (hasCompoundInterestOptions && amount > 0) {
         // If options were generated, ensure the Next button state reflects selection (handled in updateAllCalculationsAndUI)
         if(btnNext4) btnNext4.disabled = !appData.financing.selectedInstallment;
    }
    // else: amount is 0 or less, handled in Scenario 1.
}

function selectInstallment(months, value, totalPaid, element) {
    // Store the details of the selected installment
    appData.financing.selectedInstallment = { months, value, totalPaid };
    console.log("Selected Installment:", appData.financing.selectedInstallment);

    // Remove 'selected' class from all installment cards
    document.querySelectorAll('#installmentOptionsContainer .installment-option-card').forEach(el => el.classList.remove('selected'));
    // Add 'selected' class to the clicked element
    if (element) {
        element.classList.add('selected');
    }

    // Enable the "Next" button for screen 4
    document.getElementById('btnNext4').disabled = false;
}


function calculateLastInstallmentDate(firstDateStr, months) {
    // Expects firstDateStr in 'YYYY-MM-DD' format (UTC)
    if (!firstDateStr || typeof months !== 'number' || months <= 0) {
        console.error("Invalid input for calculateLastInstallmentDate:", { firstDateStr, months });
        return 'Data inválida';
    }

    const dateParts = firstDateStr.split('-');
    if (dateParts.length !== 3) {
         console.error("firstDateStr not in YYYY-MM-DD format:", firstDateStr);
         return 'Formato de data inválido';
    }

    const year = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed in Date objects
    const day = parseInt(dateParts[2]);

    // Create the date in UTC
    const firstDateUTC = new Date(Date.UTC(year, month, day));

    // Create a new Date object for the last installment date, starting from the first date
    const lastDateUTC = new Date(firstDateUTC);

    // Add `months - 1` to the month index to get the month of the last installment
    // (The first installment is month 0 relative to the start date, the second is month 1, ..., the Nth is month N-1)
    lastDateUTC.setUTCMonth(firstDateUTC.getUTCMonth() + months - 1);

    // setUTCMonth automatically handles month/year rollovers (e.g., adding 12 months)
    // and adjusts the day if it overflows (e.g., setting day 31 in February moves to March).

    // To stick to the original day of the month if possible (e.g., if first is on the 10th, last is on the 10th)
    // Get the last day of the *target* month for the last installment date
     const targetMonthYear = lastDateUTC.getUTCFullYear();
     const targetMonthMonth = lastDateUTC.getUTCMonth(); // This is the month AFTER setUTCMonth

     // Get the last day of the target month
     const lastDayOfTargetMonth = new Date(Date.UTC(targetMonthYear, targetMonthMonth + 1, 0)).getUTCDate(); // Month + 1, Day 0 gives the last day of Month

    // Use the original day, unless it's greater than the last day of the target month
    const originalDay = firstDateUTC.getUTCDate();
    const finalDay = Math.min(originalDay, lastDayOfTargetMonth);

    // Set the day of the last installment date to the calculated final day
    lastDateUTC.setUTCDate(finalDay);


    // Format and return the last installment date for display
    return formatDateForDisplay(formatDateForInput(lastDateUTC));
}


function formatCurrencyForFeedback(n) {
    // Formats a number as currency string in BRL
    if (n === null || n === undefined) return "R$ 0,00"; // Handle null/undefined
    const num = parseFloat(n);
    if (isNaN(num)) return "valor inválido"; // Handle non-numeric input
    // Use toLocaleString for correct BRL currency format, handling decimals
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


// --- Screen 5 Functions (Summary & WhatsApp) ---

function prepareSummaryAndWhatsApp() {
    const si = appData.financing.selectedInstallment; // Selected installment details
    const totalWithWarranty = appData.baseTotalAmount * (1 + appData.warranty.percentageValue); // Total amount including warranty
    let amountFinancedDisplay = totalWithWarranty - appData.entry.calculatedAmount; // Amount actually financed
    if (amountFinancedDisplay < 0) amountFinancedDisplay = 0; // Ensure non-negative display

    // Populate Client Info
    document.getElementById('summaryClientName').textContent = appData.client.name;
    document.getElementById('summaryClientCpf').textContent = appData.client.cpf; // Masked CPF
    document.getElementById('summaryOrderDate').textContent = appData.order.currentDate; // Formatted date

    // Populate Products Info
    const productListDiv = document.getElementById('summaryProductList');
    productListDiv.innerHTML = ''; // Clear previous list
    appData.products.forEach(p => {
        const pElem = document.createElement('p');
        pElem.classList.add('summary-product-item');
        pElem.textContent = `- ${p.name} (${formatCurrencyForFeedback(p.value)})`;
        productListDiv.appendChild(pElem);
    });
    document.getElementById('summaryItemCount').textContent = appData.products.length;
    document.getElementById('summaryTotalProducts').textContent = formatCurrencyForFeedback(appData.baseTotalAmount); // Formatted total
    document.getElementById('summaryWarrantyType').textContent = appData.warranty.type === 'none' ? 'Nenhuma' : `${appData.warranty.type} meses`;

    // Populate Entry Info
    document.getElementById('summaryEntryAmount').textContent = formatCurrencyForFeedback(appData.entry.calculatedAmount); // Formatted entry amount
    document.getElementById('summaryEntryPercentage').textContent = `${(appData.entry.effectivePercentage * 100).toFixed(1)}%`; // Effective percentage formatted
    document.getElementById('summaryAmountFinancedInternal').textContent = formatCurrencyForFeedback(amountFinancedDisplay); // Formatted amount to finance

    // Populate Financing Details OR No Financing Message
    const financingSummaryDetailsDiv = document.getElementById('financingSummaryDetails');
    const noFinancingMessageDiv = document.getElementById('noFinancingSummaryMessage');

    // Show financing details ONLY if there is an amount to finance AND a valid installment selected
    if (amountFinancedDisplay > 0 && si && si.months > 0) {
        financingSummaryDetailsDiv.style.display = 'block'; // Show the details section
        noFinancingMessageDiv.style.display = 'none'; // Hide the no financing message

        document.getElementById('summaryInstallmentMonths').textContent = si.months;
        document.getElementById('summaryInstallmentValue').textContent = formatCurrencyForFeedback(si.value); // Formatted installment value
        document.getElementById('summaryTotalPaidCarnet').textContent = formatCurrencyForFeedback(si.totalPaid); // Formatted total paid

        document.getElementById('summaryFirstInstallmentDate').textContent = formatDateForDisplay(appData.order.firstInstallmentDate); // Formatted first date

        // Calculate and display the last installment date
        appData.order.lastInstallmentDate = calculateLastInstallmentDate(appData.order.firstInstallmentDate, si.months);
        document.getElementById('summaryLastInstallmentDate').textContent = appData.order.lastInstallmentDate;

    } else {
        // Hide financing details and show the appropriate message
        financingSummaryDetailsDiv.style.display = 'none';
        noFinancingMessageDiv.style.display = 'block';

        if (amountFinancedDisplay > 0) {
             // This case implies amount > 0 but no installment was selected or generated.
             // This state should ideally be prevented by validation/button disabled state on Screen 4.
             noFinancingMessageDiv.textContent = "Não foi possível gerar ou selecionar opções de parcelamento para o valor financiado.";
        } else {
             // This case implies amount <= 0 (entry covered total)
             noFinancingMessageDiv.textContent = "Não há valor a financiar. O valor total foi coberto pela entrada ou é zero.";
        }
        appData.order.lastInstallmentDate = ''; // Clear last installment date if no financing
         // Ensure the span shows N/A or similar if message is shown
         document.getElementById('summaryLastInstallmentDate').textContent = 'N/A';
    }


    // --- Prepare WhatsApp Message ---
    const todayForWhatsapp = new Date().toLocaleDateString('pt-BR', {day: '2-digit', month: 'long', year: 'numeric'}); // Format for message

    let conversationalWhatsappMsg = `\ud83d\udc4b Olá Edney, tudo bem com você? Espero que sim!\n\n`;
    conversationalWhatsappMsg += `\ud83d\udcc5 Estou te enviando esse Orçamento de Financiamento, hoje dia ${todayForWhatsapp}.\n\n`;
    conversationalWhatsappMsg += `\ud83d\udc64 Meu nome completo é ${appData.client.name}, \ud83d\udcc3 CPF ${appData.client.cpf}.\n\n`; // Using \ud83d\udcc3 for CPF (ID Card)

    const numItens = appData.products.length;
    if (numItens === 1) {
        conversationalWhatsappMsg += `\ud83d\udecd\ufe0f Queria fazer a simulação de ${numItens} item, sendo o produto:\n`;
    } else {
        conversationalWhatsappMsg += `\ud83d\udecd\ufe0f Queria fazer a simulação de ${numItens} itens, sendo eles:\n`;
    }

    appData.products.forEach(p => {
        conversationalWhatsappMsg += `  \ud83d\udce6 ${p.name} (valor ${formatCurrencyForFeedback(p.value)})\n`; // List each product
    });

    conversationalWhatsappMsg += `\n\ud83d\udcb0 Somei tudo aqui e vai dar o *total de ${formatCurrencyForFeedback(appData.baseTotalAmount)}*.\n\n`; // Total products

     // Include warranty details if selected
     if (appData.warranty.type !== 'none') {
        const warrantyAmount = appData.baseTotalAmount * appData.warranty.percentageValue;
        conversationalWhatsappMsg += `\ud83d\udee1\ufe0f Também optei pela garantia estendida de *${appData.warranty.type} meses*, que adiciona ${formatCurrencyForFeedback(warrantyAmount)} ao total, resultando em *${formatCurrencyForFeedback(totalWithWarranty)}*.\n\n`;
    } else {
        conversationalWhatsappMsg += `\ud83d\udee1\ufe0f Não adicionei garantia estendida ao pedido, o valor base é o total dos produtos: *${formatCurrencyForFeedback(totalWithWarranty)}*.\n\n`;
    }


    // Include entry details
    if (appData.entry.calculatedAmount > 0) {
        conversationalWhatsappMsg += `\ud83d\udcb0 Estou pensando em dar uma *entrada de ${formatCurrencyForFeedback(appData.entry.calculatedAmount)}*. `;
        conversationalWhatsappMsg += `\ud83d\udcb8 Com isso, o valor para financiar fica em *${formatCurrencyForFeedback(amountFinancedDisplay)}*.\n\n`;
    } else {
        conversationalWhatsappMsg += `\ud83d\udcb8 No momento, prefiro *não dar entrada*, então o valor para financiar seria de *${formatCurrencyForFeedback(amountFinancedDisplay)}*.\n\n`;
    }

    // Include financing details if a valid installment was selected
    if (amountFinancedDisplay > 0 && si && si.months > 0) {
        conversationalWhatsappMsg += `\u2705 A opção de parcelamento que mais me agradou foi em *${si.months} vezes de ${formatCurrencyForFeedback(si.value)}*.\n`; // Selected installment details
        conversationalWhatsappMsg += `\ud83d\udcc5 A primeira parcela ficaria para *${formatDateForDisplay(appData.order.firstInstallmentDate)}*.`; // First installment date
        if (appData.order.lastInstallmentDate) { // Include last date if calculated
             conversationalWhatsappMsg += ` E a última parcela para *${appData.order.lastInstallmentDate}*.\n\n`;
        } else {
             conversationalWhatsappMsg += `\n\n`; // Newline if last date is not available (shouldn't happen here)
        }
         conversationalWhatsappMsg += `\ud83d\udcb3 O total a ser pago no carnê seria de *${formatCurrencyForFeedback(si.totalPaid)}*.\n\n`; // Total paid formatted

    } else {
        // Message if no financing needed or possible
        conversationalWhatsappMsg += `\u274c Não há parcelamento pois a entrada cobre o valor total, ou não foi possível gerar opções para o valor financiado. O valor total a pagar é de *${formatCurrencyForFeedback(totalWithWarranty)}*.\n\n`;
    }

    conversationalWhatsappMsg += `\ud83d\ude4f Obrigado!\n${appData.client.name.split(' ')[0]}`; // Closing
    document.getElementById('whatsappMessageFinal').value = conversationalWhatsappMsg; // Set message in textarea

    // Prepare feedback message to show on screen after clicking WhatsApp button
    let screenFeedbackMsg = `\uD83C\uDF89 *Simulação Pronta para Envio!*\n\n`;
    screenFeedbackMsg += `Olá ${appData.client.name.split(' ')[0]},\n\n`;
    screenFeedbackMsg += `Sua simulação foi gerada. Ao clicar no botão "Enviar Simulação por WhatsApp", a mensagem acima (no campo de texto) será preparada para você enviar ao Edney.\n\n`;
    screenFeedbackMsg += `Após o envio, a equipe financeira analisará sua solicitação e entrará em contato em até 24 horas úteis.\n\n`;
    screenFeedbackMsg += `Agradecemos o seu contato!`;
    appData.feedbackMessage = screenFeedbackMsg; // Store feedback message
}

function sendWhatsAppMessage() {
    const messageForWhatsapp = document.getElementById('whatsappMessageFinal').value;
    // Check if the message is empty or contains an error indicator from preparation
     if (!messageForWhatsapp || messageForWhatsapp.trim() === '' || messageForWhatsapp.startsWith("Erro:")) {
        alert("Mensagem para WhatsApp não gerada ou contém erro. Por favor, refaça os passos ou verifique a seleção de parcelas.");
        return;
    }
    // Encode the message for the URL and open WhatsApp
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messageForWhatsapp)}`;
    window.open(url, '_blank'); // Open in a new tab

    // Hide the summary and message area, show the feedback message
    const operatorSummaryContainer = document.getElementById('operatorSummaryContainer');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage'); // The info-box for feedback
    const screen5Title = document.querySelector('#screen5 h2');


    if (operatorSummaryContainer && whatsappTextarea && sendButton && prevButton && feedbackDiv && screen5Title) {
        operatorSummaryContainer.style.display = 'none'; // Hide the operator summary
        whatsappTextarea.style.display = 'none'; // Hide the message textarea
        sendButton.style.display = 'none'; // Hide the send button
        prevButton.style.display = 'none'; // Hide the previous button

        // Populate the feedback message div and show it
        feedbackDiv.innerHTML = `<h4 style="text-align:center; margin-bottom:15px;">\ud83d\udce9 Mensagem Preparada!</h4>
                                 ${appData.feedbackMessage.replace(/\n/g, '<br>')}`; // Replace newlines with <br> for HTML display
        feedbackDiv.style.display = 'block'; // Show the feedback message

        // Update the screen title
        screen5Title.innerHTML = '<i class="fas fa-check-circle"></i> Quase lá!';
    } else {
        console.error("Could not find all required elements on screen 5 for post-send update.");
    }
}

function restartSimulation() {
    console.log("Restarting simulation...");
    // Reset appData to its initial state, but preserve the loaded/default rates
    Object.assign(appData, {
        client: { name: '', cpf: '' },
        order: { currentDate: '', paymentDate: '', firstInstallmentDate: '', daysToFirstInstallment: 0, lastInstallmentDate: '' },
        products: [], baseTotalAmount: 0,
        entry: { type: 'none', percentageForFixed: 0, customAmountRaw: 0, calculatedAmount: 0, effectivePercentage: 0 },
        warranty: { type: 'none', percentageValue: 0 },
        financing: {
            amountForInstallmentCalculation: 0, selectedInstallment: null,
            // Keep the current monthly rates object reference
            monthlyInterestRates: appData.financing.monthlyInterestRates,
            // Reset the current monthly rate to the 'no entry' rate
            currentMonthlyRate: appData.financing.monthlyInterestRates.noEntry
        },
        feedbackMessage: '' // Clear feedback message
    });

    // --- Reset UI elements for Screen 1 ---
    document.getElementById('clientName').value = '';
    document.getElementById('clientCpf').value = ''; // This will also update appData.client.cpf via event listener
    checkScreen1Completion(); // Update button state

    // Reset Payment Date selection UI and data
    document.getElementById('selectedPaymentDateHidden').value = '';
    document.querySelectorAll('#paymentDayOptionsContainer .option-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#paymentDayOptionsContainer input[type="radio"]').forEach(radio => radio.checked = false); // Uncheck all radios
    const paymentDateDetailsDiv = document.getElementById('paymentDateDetails');
    if (paymentDateDetailsDiv) paymentDateDetailsDiv.style.display = 'none'; // Hide details box
    document.getElementById('firstInstallmentDateInfo').textContent = 'A definir'; // Reset displayed dates/days
    document.getElementById('daysToFirstInstallment').textContent = 'A definir';


    // --- Reset UI elements for Screen 2 ---
    document.getElementById('productSku').value = ''; // Clear SKU input
    document.getElementById('productFetchDisplay').style.display = 'none'; // Hide search results
    document.getElementById('btnAddProductToList').disabled = true; // Disable Add button
    updateProductVisor(); // Clears product list in UI and appData, resets total, and triggers recalcs

    // --- Reset UI elements for Screen 3 ---
    // Reset Entry options: Select 'none' option visually and functionally
    const defaultEntryRadio = document.querySelector('#entryOptNone');
    if (defaultEntryRadio) {
         defaultEntryRadio.checked = true; // Check the radio button
         // Find the corresponding option item div and call selectEntryOption
         const defaultEntryItem = defaultEntryRadio.closest('.option-item');
         if (defaultEntryItem) selectEntryOption('none', defaultEntryItem);
    }
     // Ensure custom entry input and group are reset/hidden
    document.getElementById('customEntryAmountInput').value = '';
    document.getElementById('customEntryValueGroup').style.display = 'none';
    // Reset displayed entry and financed amounts (updateAllCalculationsAndUI called by updateProductVisor handles this)
    document.getElementById('finalEntryValueDisplay').textContent = '0.00';
    document.getElementById('finalAmountToFinanceDisplay').textContent = '0.00';
     // Hide the entry info box
     const entryResultBox = document.getElementById('entryResultInfoBox');
    if(entryResultBox) entryResultBox.style.display = 'none';


    // Reset Warranty options: Select 'none' option visually and functionally
    const defaultWarrantyRadio = document.querySelector('#warrantyOptNone');
    if (defaultWarrantyRadio) {
         defaultWarrantyRadio.checked = true; // Check the radio button
         // Find the corresponding option item div and call selectWarrantyOption
         const defaultWarrantyItem = defaultWarrantyRadio.closest('.option-item');
         if (defaultWarrantyItem) selectWarrantyOption('none', defaultWarrantyItem);
    }


    // --- Reset UI elements for Screen 4 ---
    document.getElementById('installmentOptionsContainer').innerHTML = '<p>Aguardando...</p>'; // Clear installment options display
    // Disable the next button for screen 4 (unless no financing is needed, which is handled by updateAllCalculationsAndUI/showScreen)
    const btnNext4 = document.getElementById('btnNext4');
    if(btnNext4) btnNext4.disabled = true;


    // --- Reset UI elements for Screen 5 ---
    document.getElementById('whatsappMessageFinal').value = ''; // Clear WhatsApp message textarea
    // Ensure summary and message areas are visible again (as they might have been hidden after sending)
    const operatorSummaryContainer = document.getElementById('operatorSummaryContainer');
    const whatsappTextarea = document.getElementById('whatsappMessageFinal');
    const sendButton = document.getElementById('sendWppButton');
    const prevButton = document.getElementById('prevButtonScreen5');
    const feedbackDiv = document.getElementById('onScreenFeedbackMessage');
    const screen5Title = document.querySelector('#screen5 h2');
    const financingSummaryDetailsDiv = document.getElementById('financingSummaryDetails'); // Ensure financing details are visible (if data is present)
    const noFinancingMessageDiv = document.getElementById('noFinancingSummaryMessage'); // Ensure no financing message is hidden


    if (operatorSummaryContainer) operatorSummaryContainer.style.display = 'block';
    if (whatsappTextarea) whatsappTextarea.style.display = 'block';
    if (sendButton) sendButton.style.display = 'block';
    if (prevButton) prevButton.style.display = 'block';
    if (feedbackDiv) feedbackDiv.style.display = 'none'; // Hide feedback
    if (screen5Title) screen5Title.innerHTML = '<i class="fas fa-file-alt> Resumo da Simulação'; // Reset title
    if (financingSummaryDetailsDiv) financingSummaryDetailsDiv.style.display = 'block'; // Reset visibility (content will be updated by prepareSummaryAndWhatsApp)
    if (noFinancingMessageDiv) noFinancingMessageDiv.style.display = 'none'; // Reset visibility

    // Re-initialize Screen 1 (gets current date, generates payment days, etc.)
    // This also calls generatePaymentDayOptions and sets currentDate
    initializeScreen1();

    // Go back to the first screen
    showScreen(1);
}

// Initial call to load rates and initialize the first screen on page load
// DOMContentLoaded handles this now


// Note: Event listeners for option items, product search/add, and WhatsApp send
// are now added programmatically in DOMContentLoaded using addEventListener
// instead of using inline onclick attributes in the HTML.
