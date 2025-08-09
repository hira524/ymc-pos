import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { loadStripeTerminal } from '@stripe/terminal-js';
import ThemeToggle from './ThemeToggle';
import './App.css';
import './components.css';
import './themes.css';
import './animations.css';
import './pos.css';

// Custom Alert Component
const CustomAlert = ({ alert, onClose }) => {
  if (!alert) return null;

  const getTitle = (type) => {
    switch (type) {
      case 'success': return 'Success';
      case 'error': return 'Error';
      case 'warning': return 'Warning';
      case 'info': return 'Information';
      default: return 'Alert';
    }
  };

  // Enhanced message formatting
  const formatMessage = (message) => {
    return message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/<span class="highlight">(.*?)<\/span>/g, '<span class="highlight">$1</span>')
      .replace(/<span class="code">(.*?)<\/span>/g, '<span class="code">$1</span>');
  };

  return (
    <div className="custom-alert-overlay" onClick={onClose}>
      <div className={`custom-alert ${alert.type}`} onClick={e => e.stopPropagation()}>
        <div className="custom-alert-header">
          <div className="custom-alert-icon"></div>
          <h3 className="custom-alert-title">{getTitle(alert.type)}</h3>
        </div>
        <div className="custom-alert-body">
          <div 
            className="custom-alert-message" 
            dangerouslySetInnerHTML={{ __html: formatMessage(alert.message) }}
          />
        </div>
        <div className="custom-alert-footer">
          <button className="custom-alert-button" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// Payment Processing Popup Component
const PaymentProcessingPopup = ({ isVisible, step, progress, onCancel }) => {
  if (!isVisible) return null;

  const getStepIcon = (step) => {
    switch (step) {
      case 'initializing': return '🔄';
      case 'waiting_for_card': return '💳';
      case 'processing': return '⚡';
      case 'completing': return '✅';
      default: return '💳';
    }
  };

  const getStepMessage = (step) => {
    switch (step) {
      case 'initializing': return 'Initializing payment...';
      case 'waiting_for_card': return 'Please present your card to the terminal';
      case 'processing': return 'Processing payment...';
      case 'completing': return 'Finalizing transaction...';
      default: return 'Processing payment...';
    }
  };

  const canCancel = (step) => {
    return step === 'initializing' || step === 'waiting_for_card';
  };

  const getCancelButtonText = (step) => {
    if (step === 'processing' || step === 'completing') {
      return 'Please Wait...';
    }
    return 'Cancel Payment';
  };

  return (
    <div className="payment-popup-overlay">
      <div className="payment-popup">
        <div className="payment-popup-header">
          <h3>💳 Card Payment Processing</h3>
        </div>
        
        <div className="payment-popup-body">
          <div className="payment-icon-container">
            <div className="payment-icon">{getStepIcon(step)}</div>
          </div>
          
          <div className="payment-message">
            <h4>{getStepMessage(step)}</h4>
            {step === 'waiting_for_card' && (
              <p className="payment-instruction">
                Insert, tap, or swipe your card on the payment terminal.<br/>
                <strong>You can still cancel at this point.</strong>
              </p>
            )}
            {step === 'processing' && (
              <p className="payment-instruction">
                Please wait while we process your payment.<br/>
                <strong>Do not remove your card yet.</strong>
              </p>
            )}
            {step === 'initializing' && (
              <p className="payment-instruction">
                Setting up secure payment connection...
              </p>
            )}
            {step === 'completing' && (
              <p className="payment-instruction">
                Almost done! Finalizing your transaction...
              </p>
            )}
          </div>
          
          <div className="payment-progress-container">
            <div className="payment-progress-bar">
              <div 
                className="payment-progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="payment-progress-text">{progress}%</div>
          </div>
        </div>
        
        <div className="payment-popup-footer">
          <button 
            className={`payment-cancel-btn ${canCancel(step) ? 'cancel-available' : 'cancel-disabled'}`}
            onClick={onCancel}
            disabled={!canCancel(step)}
          >
            {getCancelButtonText(step)}
          </button>
          {canCancel(step) && (
            <p className="cancel-help-text">
              Cancelling will return you to the cart without charging your card.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Cash Calculator Popup Component
const CashCalculatorPopup = ({ isVisible, orderTotal, onComplete, onCancel }) => {
  const [amountReceived, setAmountReceived] = useState('');
  const [error, setError] = useState('');

  if (!isVisible) return null;

  const receivedAmount = parseFloat(amountReceived) || 0;
  const changeAmount = receivedAmount - orderTotal;
  const isValidPayment = receivedAmount >= orderTotal;

  const handleAmountChange = (value) => {
    // Remove any non-numeric characters except decimal point
    const cleanValue = value.replace(/[^\d.]/g, '');
    
    // Ensure only one decimal point
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
      return;
    }
    
    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) {
      return;
    }
    
    setAmountReceived(cleanValue);
    setError('');
  };

  const handleNumberClick = (num) => {
    if (amountReceived.includes('.') && num === '.') return;
    if (amountReceived.length >= 10) return;
    
    const newAmount = amountReceived + num;
    handleAmountChange(newAmount);
  };

  const handleClear = () => {
    setAmountReceived('');
    setError('');
  };

  const handleBackspace = () => {
    setAmountReceived(amountReceived.slice(0, -1));
    setError('');
  };

  const handleComplete = () => {
    if (!isValidPayment) {
      setError('Amount received must be greater than or equal to the total');
      return;
    }
    onComplete(receivedAmount, changeAmount);
    setAmountReceived('');
    setError('');
  };

  const handleCancel = () => {
    setAmountReceived('');
    setError('');
    onCancel();
  };

  // Smart quick amount suggestions
  const quickAmounts = [
    orderTotal, // Exact amount
    Math.ceil(orderTotal / 5) * 5, // Round to next $5
    Math.ceil(orderTotal / 10) * 10, // Round to next $10
    Math.ceil(orderTotal / 20) * 20, // Round to next $20
    50, 100 // Common bills
  ].filter((amount, index, arr) => amount >= orderTotal && arr.indexOf(amount) === index)
   .sort((a, b) => a - b)
   .slice(0, 4);

  return (
    <div className="cash-calculator-overlay">
      <div className="cash-calculator">
        <div className="cash-calculator-header">
          <h3>💵 Cash Payment Calculator</h3>
          <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
            Calculate change for cash payments
          </p>
        </div>
        
        <div className="cash-calculator-body">
          {/* Order Summary Section */}
          <div className="order-summary">
            <div className="order-total">
              <span className="label">Order Total:</span>
              <span className="amount">${orderTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Amount Input Section */}
          <div className="amount-input-section">
            <label>Amount Received from Customer:</label>
            <div className="amount-input-container">
              <span className="currency-symbol">$</span>
              <input
                type="text"
                value={amountReceived}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="amount-input"
                autoFocus
              />
            </div>
            {error && <div className="error-message">⚠️ {error}</div>}
          </div>

          {/* Quick Amount Buttons */}
          <div className="quick-amounts">
            <div className="quick-amounts-label">💡 Quick Select Common Amounts:</div>
            <div className="quick-amount-buttons">
              {quickAmounts.map(amount => (
                <button
                  key={amount}
                  className="quick-amount-btn"
                  onClick={() => handleAmountChange(amount.toString())}
                >
                  ${amount.toFixed(2)}
                </button>
              ))}
            </div>
          </div>

          {/* Calculator Keypad */}
          <div className="calculator-keypad">
            <div className="keypad-row">
              <button className="keypad-btn" onClick={() => handleNumberClick('7')}>7</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('8')}>8</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('9')}>9</button>
            </div>
            <div className="keypad-row">
              <button className="keypad-btn" onClick={() => handleNumberClick('4')}>4</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('5')}>5</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('6')}>6</button>
            </div>
            <div className="keypad-row">
              <button className="keypad-btn" onClick={() => handleNumberClick('1')}>1</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('2')}>2</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('3')}>3</button>
            </div>
            <div className="keypad-row">
              <button className="keypad-btn keypad-zero" onClick={() => handleNumberClick('0')}>0</button>
              <button className="keypad-btn" onClick={() => handleNumberClick('.')}>•</button>
              <button className="keypad-btn keypad-backspace" onClick={handleBackspace} title="Backspace">⌫</button>
            </div>
            <div className="keypad-row">
              <button className="keypad-btn keypad-clear" onClick={handleClear}>Clear All</button>
            </div>
          </div>

          {/* Change Calculation Display */}
          {receivedAmount && (
            <div className="change-calculation">
              <div className="change-summary">
                <div className="change-row">
                  <span>💰 Amount Received:</span>
                  <span className="amount-received">${receivedAmount.toFixed(2)}</span>
                </div>
                <div className="change-row">
                  <span>🧾 Order Total:</span>
                  <span className="order-total-amount">-${orderTotal.toFixed(2)}</span>
                </div>
                <div className="change-row change-result">
                  <span>{changeAmount >= 0 ? '💵 Change to Give:' : '❌ Still Needed:'}</span>
                  <span className={`change-amount ${changeAmount < 0 ? 'insufficient' : 'sufficient'}`}>
                    ${Math.abs(changeAmount).toFixed(2)}
                    {changeAmount < 0 && ' (Insufficient)'}
                    {changeAmount === 0 && ' (Exact)'}
                  </span>
                </div>
                {changeAmount > 0 && (
                  <div style={{ 
                    textAlign: 'center', 
                    marginTop: '12px', 
                    padding: '8px', 
                    background: 'rgba(255, 255, 255, 0.8)', 
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600'
                  }}>
                    💡 Give the customer <strong>${changeAmount.toFixed(2)}</strong> in change
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Footer with Action Buttons */}
        <div className="cash-calculator-footer">
          <button 
            className="calculator-cancel-btn"
            onClick={handleCancel}
            title="Cancel and return to cart"
          >
            ← Cancel
          </button>
          <button 
            className={`calculator-complete-btn ${isValidPayment ? 'enabled' : 'disabled'}`}
            onClick={handleComplete}
            disabled={!isValidPayment || !amountReceived}
            title={isValidPayment ? 'Complete the cash payment' : 'Enter sufficient amount to proceed'}
          >
            {!amountReceived ? 'Enter Amount' : 
             !isValidPayment ? `Need $${(orderTotal - receivedAmount).toFixed(2)} More` : 
             changeAmount === 0 ? 'Complete Payment (Exact)' : 
             `Complete Payment (Give $${changeAmount.toFixed(2)} Change)`}
          </button>
        </div>
      </div>
    </div>
  );
};

function App() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [terminal, setTerminal] = useState(null);
  const [reader, setReader] = useState(null);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [testMode, setTestMode] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState('');
  const [paymentProgress, setPaymentProgress] = useState(0);
  const [paymentSnapshot, setPaymentSnapshot] = useState({ cart: [], total: 0 });
  const [cashCalculatorOpen, setCashCalculatorOpen] = useState(false);

  // Dynamic backend URL for different environments
  const getBackendUrl = () => {
    // Production environment (Netlify + Render)
    if (window.location.hostname.includes('netlify.app') || 
        window.location.hostname !== 'localhost') {
      return process.env.REACT_APP_BACKEND_URL || 'https://ymc-pos-backend.onrender.com';
    }
    
    // Codespaces environment
    if (window.location.hostname.includes('github.dev')) {
      const baseUrl = window.location.origin.replace('-3000.', '-5000.');
      return baseUrl;
    }
    
    // Local development
    return 'http://localhost:5000';
  };

  const BACKEND_URL = getBackendUrl();

  // Custom Alert Helper Functions
  const showAlert = (message, type = 'info') => {
    setCurrentAlert({ message, type });
  };

  const closeAlert = () => {
    setCurrentAlert(null);
  };

  // Retry card reader connection
  const retryReaderConnection = async () => {
    if (!terminal) {
      showAlert('**Retry Failed**\n\nPayment system not initialized. Please refresh the page.', 'error');
      return;
    }

    showAlert('**Retrying Connection**\n\nAttempting to reconnect to payment terminal.\n\nPlease wait...', 'info');

    try {
      // Use the current test mode for retry
      const discoverConfig = testMode ? 
        { simulated: true } : 
        { 
          simulated: false,
          location: process.env.REACT_APP_STRIPE_LOCATION_ID || 'tml_GBoQHwGS5rcO0D'
        };

      console.log('🔄 Retry: Discovering readers with config:', discoverConfig);
      const discoveryResult = await terminal.discoverReaders(discoverConfig);
      
      if (!discoveryResult) {
        return showAlert('**Retry Failed**\n\nNo response from reader discovery.\n\n*Please try again or contact support.*', 'error');
      }
      
      const { discoveredReaders, error } = discoveryResult;

      if (error) {
        console.error('Retry discover readers error:', error);
        return showAlert(`**Retry Failed**\n\nStill unable to locate payment terminals.\n\n**Error:** ${error.message}\n\n*Please check device status and try again.*`, 'error');
      }

      if (discoveredReaders.length === 0) {
        const retryMessage = testMode
          ? '**No Simulated Devices Found**\n\nNo test payment terminals detected during retry.\n\n*This is unusual - simulated readers should always be available in test mode.*'
          : '**No Devices Found**\n\nNo payment terminals detected during retry.\n\n*Please ensure your device is powered on and connected.*';
        return showAlert(retryMessage, 'warning');
      }

      const reader = discoveredReaders[0];
      console.log('🔄 Retry: Connecting to reader:', reader.id, testMode ? '(simulated)' : '(physical)');
      
      const connectionResult = await terminal.connectReader(reader);
      
      if (!connectionResult) {
        console.error('Retry connect reader error: No result returned');
        return showAlert('**Retry Connection Failed**\n\nNo response from terminal connection.\n\n*Please try again or contact support.*', 'error');
      }
      
      const { reader: connectedReader, error: connectError } = connectionResult;

      if (connectError) {
        console.error('Retry connect reader error:', connectError);
        return showAlert(`**Retry Connection Failed**\n\n${connectError.message}\n\n*Please try again or contact support.*`, 'error');
      }

      setReader(connectedReader);
      const successMessage = testMode
        ? '**Simulated Terminal Reconnected**\n\nTest payment terminal is now ready for simulation.'
        : '**Reconnection Successful**\n\nPayment terminal is now ready for transactions.';
      showAlert(successMessage, 'success');
    } catch (error) {
      console.error('Retry connection error:', error);
      showAlert(`**Retry Process Failed**\n\nUnable to complete reconnection attempt.\n\n**Error:** ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    // 1) Fetch Stripe configuration first, then initialize terminal
    axios.get(`${BACKEND_URL}/stripe/config`)
      .then(r => {
        const isTestMode = r.data.testMode;
        setTestMode(isTestMode);
        console.log('Stripe config loaded:', isTestMode ? 'TEST MODE (Simulation)' : 'LIVE MODE');
        
        // Initialize terminal AFTER we have the config
        return initializeStripeTerminal(isTestMode);
      })
      .catch(e => {
        console.warn('Could not fetch Stripe config:', e.message);
        // Default to test mode if config fetch fails
        setTestMode(true);
        return initializeStripeTerminal(true); // Default to test mode
      });

    // 2) Fetch inventory in parallel
    axios.get(`${BACKEND_URL}/inventory`)
      .then(r => {
        setInventory(r.data);
        console.log('Inventory loaded successfully:', r.data.length, 'items');
        if (r.data.length === 0) {
          showAlert('**Inventory Notice**\n\nNo products found in inventory.\n\n*Please add products to start selling.*', 'warning');
        }
      })
      .catch(e => {
        console.error('Inventory fetch error:', e.response?.data || e.message);
        showAlert(`**Inventory Loading Failed**\n\nUnable to load product catalog from server.\n\n**Error Details:**\n${e.response?.data?.error || e.message}\n\n**Troubleshooting:**\n• Check server connection\n• Verify backend is running\n• Contact system administrator\n\n*POS system may not function properly without inventory.*`, 'error');
      });
  }, [BACKEND_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate function to initialize Stripe Terminal
  const initializeStripeTerminal = async (isTestMode) => {
    try {
      const StripeTerminal = await loadStripeTerminal();
      console.log('✅ Stripe Terminal library loaded successfully');
      console.log('🎯 Initializing in mode:', isTestMode ? 'TEST (Simulated Readers)' : 'LIVE (Physical Readers)');
      
      const term = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          try {
            const r = await axios.post(`${BACKEND_URL}/connection_token`);
            return r.data.secret;
          } catch (error) {
            console.error('Connection token error:', error.response?.data || error.message);
            showAlert(`**Connection Failed**\n\nUnable to establish secure connection with Stripe payment system.\n\n**Error Details:**\n${error.response?.data?.error || error.message}\n\n*Please check your internet connection and API keys.*`, 'error');
            throw error;
          }
        },
        onUnexpectedReaderDisconnect: () => {
          setReader(null); // Clear the reader state
          showAlert('**Card Reader Disconnected**\n\nThe payment terminal has been unexpectedly disconnected.\n\n**What happened:**\n• Network connection lost\n• Device powered off\n• Physical connection interrupted\n\n**What to do:**\n• Check device power and network\n• Click "Retry" to reconnect\n• Use cash payment if needed\n\n*Card payments are temporarily unavailable.*', 'warning');
        }
      });
      setTerminal(term);

      // Show initial status message
      showAlert(
        isTestMode 
          ? '**Initializing Test Payment System**\n\nSearching for simulated payment terminals for testing.\n\nPlease wait while we establish connection...'
          : '**Initializing Payment System**\n\nSearching for available payment terminals in your area.\n\nPlease wait while we establish connection...', 
        'info'
      );

      // Configure reader discovery based on test mode
      const discoverConfig = isTestMode ? 
        { simulated: true } : // Test mode: use simulated readers
        { 
          simulated: false,
          location: process.env.REACT_APP_STRIPE_LOCATION_ID || 'tml_GBoQHwGS5rcO0D'
        };
      
      console.log('🔍 Discovering readers with config:', discoverConfig);
      
      const discoveryResult = await term.discoverReaders(discoverConfig);
      
      if (!discoveryResult) {
        throw new Error('No result returned from reader discovery');
      }
      
      const { discoveredReaders, error } = discoveryResult;
      
      if (error) {
        console.error('Discover readers error:', error);
        return showAlert(`**Reader Discovery Failed**\n\nUnable to locate payment terminals in your area.\n\n**Error:** ${error.message}\n\n*Please ensure your payment device is powered on and connected to the network.*`, 'error');
      }
      
      if (discoveredReaders.length === 0) {
        const noReaderMessage = isTestMode 
          ? '**No Simulated Readers Found**\n\nNo test payment terminals were detected.\n\n**This is unusual for test mode. Please:**\n• Refresh the page\n• Check browser console for errors\n• Verify your test Stripe key\n• Contact support if issue persists\n\n*Simulated readers should always be available in test mode.*'
          : '**No Payment Terminals Found**\n\nNo compatible payment devices were detected at this location.\n\n**Please verify:**\n• BBPOS reader is powered on and ready\n• Device is connected to the same Wi-Fi network\n• Terminal status shows "online" in Stripe Dashboard\n• Device is within network range\n\n*Contact support if the issue persists.*';
        return showAlert(noReaderMessage, 'warning');
      }
      
      console.log('Found readers:', discoveredReaders.length, isTestMode ? 'simulated' : 'physical');
      
      // Show success message for reader discovery
      const successMessage = isTestMode
        ? `**Simulated Payment Terminal Ready**\n\nDiscovered ${discoveredReaders.length} test payment device${discoveredReaders.length > 1 ? 's' : ''} for simulation.\n\nAttempting to establish connection...`
        : `**Payment Terminal Found**\n\nDiscovered ${discoveredReaders.length} compatible payment device${discoveredReaders.length > 1 ? 's' : ''}.\n\nAttempting to establish connection...`;
      showAlert(successMessage, 'success');
      
      // Connect to the first available reader
      const reader = discoveredReaders[0];
      console.log('Attempting to connect to reader:', reader.id, reader.device_type, isTestMode ? '(simulated)' : '(physical)');
      
      // Configure connection options based on reader type
      const connectOptions = isTestMode ? {} : {
        // If reader shows a pairing code, this function will be called
        onReaderDisplayPairingCode: (pairingCode) => {
          console.log('Pairing code displayed on reader:', pairingCode);
          showAlert(`**Device Pairing Required**\n\nYour BBPOS payment terminal is requesting secure pairing.\n\n**Pairing Code:** <span class="highlight">${pairingCode}</span>\n\n**Next Steps:**\n1. Check your BBPOS device screen\n2. Verify the pairing code matches: **${pairingCode}**\n3. Confirm the pairing on your device\n4. Click OK below to continue\n\n*This ensures secure communication between devices.*`, 'info');
        }
      };
      
      const connectionResult = await term.connectReader(reader, connectOptions);
      
      if (!connectionResult) {
        throw new Error('No result returned from reader connection');
      }
      
      const { reader: connectedReader, error: connectError } = connectionResult;
      
      if (connectError) {
        console.error('Connect reader error:', connectError);
        return showAlert(`**Connection Failed**\n\nUnable to establish connection with the payment terminal.\n\n**Error Details:**\n${connectError.message}\n\n**Troubleshooting Steps:**\n• Restart the payment device\n• Check network connectivity\n• Ensure device is not connected elsewhere\n• Contact technical support if needed\n\n*Please try again after following these steps.*`, 'error');
      }
      
      setReader(connectedReader);
      console.log('Connected to payment reader:', connectedReader.id);
      
      // Show success alert for card reader connection
      const connectionSuccessMessage = isTestMode
        ? `**Simulated Terminal Connected**\n\nTest payment terminal "${connectedReader.label || connectedReader.id}" is ready for simulation.\n\n*You can now test card payments without real money.*`
        : `**Card Reader Connected Successfully**\n\nPayment terminal "${connectedReader.label || connectedReader.id}" is now ready for transactions.\n\n*You can now accept card payments.*`;
      showAlert(connectionSuccessMessage, 'success');
      
    } catch (error) {
      console.error('Stripe Terminal initialization error:', error);
      showAlert(`**Payment System Initialization Failed**\n\nUnable to initialize the Stripe Terminal payment system.\n\n**Error Details:**\n${error.message || 'Unknown initialization error'}\n\n**Possible Causes:**\n• Network connectivity issues\n• Invalid Stripe configuration\n• Browser compatibility problems\n• Missing payment terminal drivers\n\n**Solutions:**\n• Refresh the page and try again\n• Check your internet connection\n• Contact system administrator\n• Use cash payment as alternative\n\n*Card payments will not be available until this is resolved.*`, 'error');
    }
  };

  const filtered = inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const addToCart = i => {
    const exists = cart.find(c => c.id === i.id);
    if (exists) {
      exists.quantity++;
      setCart([...cart]);
    } else {
      setCart([...cart, { ...i, quantity: 1 }]);
    }
    setTotal(t => t + i.price);
  };

  const updateQty = (id, qty) => {
    setCart(cart.map(c => {
      if (c.id === id) {
        const diff = qty - c.quantity;
        c.quantity = qty;
        setTotal(t => t + diff * c.price);
      }
      return c;
    }));
  };

  const removeFromCart = (id) => {
    const itemToRemove = cart.find(c => c.id === id);
    if (itemToRemove) {
      setTotal(t => t - (itemToRemove.price * itemToRemove.quantity));
      setCart(cart.filter(c => c.id !== id));
    }
  };

  const complete = async method => {
    // 1) Update inventory
    await axios.post(`${BACKEND_URL}/update-inventory`, { cart })
      .catch(e => console.error('Update inv error:', e.response?.data || e.message));
    // 2) Log payment
    await axios.post(`${BACKEND_URL}/log-payment`, {
      items: cart,
      total,
      method
    }).catch(e => console.error('Log payment error:', e.response?.data || e.message));

    setCart([]);
    setTotal(0);
    showAlert(`**Payment Successful**\n\nTransaction completed using ${method.toUpperCase()} payment.\n\nThank you for your purchase!`, 'success');
  };

  const completeWithSnapshot = async (method, snapshotCart, snapshotTotal) => {
    // 1) Update inventory using snapshot data
    await axios.post(`${BACKEND_URL}/update-inventory`, { cart: snapshotCart })
      .catch(e => console.error('Update inv error:', e.response?.data || e.message));
    // 2) Log payment using snapshot data
    await axios.post(`${BACKEND_URL}/log-payment`, {
      items: snapshotCart,
      total: snapshotTotal,
      method
    }).catch(e => console.error('Log payment error:', e.response?.data || e.message));

    // Clear the current cart (regardless of what's in it now)
    setCart([]);
    setTotal(0);
    // Clear payment snapshot
    setPaymentSnapshot({ cart: [], total: 0 });
    showAlert(`**Payment Successful**\n\nTransaction completed using ${method.toUpperCase()} payment for $${snapshotTotal.toFixed(2)}.\n\nThank you for your purchase!`, 'success');
  };

  const checkout = async method => {
    if (cart.length === 0) return showAlert('**Empty Cart**\n\nYour shopping cart is currently empty.\n\n*Please add some items before proceeding to checkout.*', 'warning');
    
    if (method === 'cash') {
      // Capture cart state for cash payment
      setPaymentSnapshot({ cart: [...cart], total: total });
      setCashCalculatorOpen(true);
      return;
    }

    if (!terminal || !reader) return showAlert('**Payment Terminal Required**\n\nNo card payment terminal is currently connected.\n\n**For card payments:**\n• Ensure your payment device is powered on\n• Check device connectivity\n• Try reconnecting the terminal\n\n*Use cash payment as an alternative.*', 'error');
    
    // Capture cart state at the moment payment starts
    const paymentCartSnapshot = [...cart];
    const paymentTotalSnapshot = total;
    const amount = Math.round(paymentTotalSnapshot * 100);
    
    // Store snapshot for consistent payment processing
    setPaymentSnapshot({ cart: paymentCartSnapshot, total: paymentTotalSnapshot });
    
    // Show payment processing popup
    setPaymentProcessing(true);
    setPaymentStep('initializing');
    setPaymentProgress(10);
    
    try {
      // Create payment intent
      setPaymentStep('initializing');
      setPaymentProgress(20);
      
      const response = await axios.post(`${BACKEND_URL}/create_payment_intent`, { amount });
      const { client_secret } = response.data;
      
      if (!client_secret) {
        setPaymentProcessing(false);
        return showAlert('**Payment Setup Failed**\n\nUnable to initialize secure payment processing.\n\n*This is usually a temporary server issue. Please try again in a moment.*\n\nIf the problem persists, contact technical support.', 'error');
      }

      // Wait for card presentation
      setPaymentStep('waiting_for_card');
      setPaymentProgress(40);

      // Collect payment method
      const { error: collectErr, paymentIntent } = await terminal.collectPaymentMethod(client_secret);
      if (collectErr) {
        setPaymentProcessing(false);
        return showAlert(`**Payment Collection Error**\n\nUnable to collect payment information from the card terminal.\n\n**Error:** ${collectErr.message}\n\n*Please try inserting/swiping the card again or use a different payment method.*`, 'error');
      }

      // Process payment
      setPaymentStep('processing');
      setPaymentProgress(70);
      
      const { error: processErr } = await terminal.processPayment(paymentIntent);
      if (processErr) {
        setPaymentProcessing(false);
        return showAlert(`**Payment Processing Failed**\n\nThe payment could not be completed successfully.\n\n**Error:** ${processErr.message}\n\n**Next Steps:**\n• Try the transaction again\n• Use a different card\n• Contact your bank if the issue persists\n• Consider cash payment as alternative`, 'error');
      }

      // Complete transaction
      setPaymentStep('completing');
      setPaymentProgress(90);
      
      // Small delay to show completion
      setTimeout(() => {
        setPaymentProgress(100);
        setTimeout(() => {
          setPaymentProcessing(false);
          // Use the snapshot data for completion, not current cart
          completeWithSnapshot('card', paymentCartSnapshot, paymentTotalSnapshot);
        }, 500);
      }, 1000);

    } catch (error) {
      setPaymentProcessing(false);
      console.error('Payment error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown payment error';
      showAlert(`**Payment Transaction Failed**\n\nWe encountered an issue while processing your payment.\n\n**Technical Details:**\n${errorMessage}\n\n**What you can do:**\n• Verify card details and try again\n• Check your internet connection\n• Use a different payment method\n• Contact customer support for assistance\n\n*Your order has not been charged.*`, 'error');
    }
  };

  const cancelPayment = async () => {
    try {
      // Cancel any ongoing terminal operations
      if (terminal && (paymentStep === 'waiting_for_card' || paymentStep === 'processing')) {
        console.log('🚫 Cancelling terminal payment collection...');
        await terminal.cancelCollectPaymentMethod();
        showAlert('**Payment Cancelled**\n\nCard payment has been cancelled successfully.\n\n*You can try again or use cash payment.*', 'info');
      }
    } catch (error) {
      console.error('Cancel payment error:', error);
      // Even if cancellation fails, we still want to reset the UI
      showAlert('**Payment Cancelled**\n\nPayment cancelled. If you were in the middle of a transaction, please wait a moment before trying again.\n\n*Terminal may need a moment to reset.*', 'warning');
    } finally {
      // Always reset the payment state
      setPaymentProcessing(false);
      setPaymentStep('');
      setPaymentProgress(0);
      // Clear payment snapshot
      setPaymentSnapshot({ cart: [], total: 0 });
    }
  };

  // Cash Calculator Handlers
  const handleCashCalculatorComplete = (amountReceived, changeAmount) => {
    setCashCalculatorOpen(false);
    
    // Complete the payment using snapshot data
    completeWithSnapshot('cash', paymentSnapshot.cart, paymentSnapshot.total);
    
    // Show change alert
    if (changeAmount > 0) {
      showAlert(`**Cash Payment Completed**\n\nAmount Received: $${amountReceived.toFixed(2)}\nOrder Total: $${paymentSnapshot.total.toFixed(2)}\n\n💰 **Change to Give: $${changeAmount.toFixed(2)}**\n\nThank you for your purchase!`, 'success');
    } else {
      showAlert(`**Cash Payment Completed**\n\nExact amount received: $${amountReceived.toFixed(2)}\n\nThank you for your purchase!`, 'success');
    }
  };

  const handleCashCalculatorCancel = () => {
    setCashCalculatorOpen(false);
    setPaymentSnapshot({ cart: [], total: 0 });
    showAlert('**Cash Payment Cancelled**\n\nReturning to cart.', 'info');
  };

  return (
    <div className="app">
      {/* Custom Alert Components */}
      <CustomAlert alert={currentAlert} onClose={closeAlert} />
      
      {/* Payment Processing Popup */}
      <PaymentProcessingPopup 
        isVisible={paymentProcessing}
        step={paymentStep}
        progress={paymentProgress}
        onCancel={cancelPayment}
      />
      
      {/* Cash Calculator Popup */}
      <CashCalculatorPopup
        isVisible={cashCalculatorOpen}
        orderTotal={paymentSnapshot.total}
        onComplete={handleCashCalculatorComplete}
        onCancel={handleCashCalculatorCancel}
      />
      
      {/* Theme Toggle */}
      <ThemeToggle />
      
      {/* Header */}
      <header className="app-header">
        <h1 className="header-title">🏪 YMC Desktop POS</h1>
        <p className="header-subtitle">Point of Sale System</p>
      </header>

      {/* Main Container */}
      <div className="main-container">
        {/* Content Area */}
        <div className="content-area">
          {/* Search Section */}
          <section className="search-section animate-fade-in">
            <h2 className="search-title">Search Products</h2>
            <input
              type="search"
              placeholder="Search items by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="search-input"
            />
          </section>

          {/* Products Section */}
          <section className="products-section animate-fade-in animate-delay-200">
            <h2 className="products-title">
              Products 
              <span className="products-count animate-pulse">{filtered.length}</span>
            </h2>
            <div className="products">
              {filtered.map((i, index) => (
                <div 
                  key={i.id} 
                  className={`product hover-lift transition-all animate-slide-in-up animate-delay-${Math.min(index * 100, 1000)}`}
                  onClick={() => addToCart(i)}
                >
                  <h3 className="product-name">{i.name}</h3>
                  <div className="product-price">${i.price.toFixed(2)}</div>
                  <div className="product-stock">
                    <span className={`stock-indicator ${
                      i.quantity > 15 ? 'stock-high' : 
                      i.quantity > 5 ? 'stock-medium' : 'stock-low'
                    }`}></span>
                    Stock: {i.quantity}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Cart Sidebar */}
        <aside className="cart">
          <div className="cart-header">
            <h2 className="cart-title">
              🛒 Cart
              <span className="cart-count">{cart.length}</span>
            </h2>
          </div>

          <div className="cart-items" style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: 'var(--spacing-3) var(--spacing-4)' }}>
            {cart.length === 0 ? (
              <div className="cart-empty">
                Your cart is empty<br/>
                <small>Click on products to add them</small>
              </div>
            ) : (
              cart.map((c, index) => (
                <div key={c.id} className="cart-item" style={{ padding: 'var(--spacing-3) 0' }}>
                  <div className="cart-item-info">
                    <div className="cart-item-name">{c.name}</div>
                    <div className="cart-item-price">${c.price.toFixed(2)} each</div>
                  </div>
                  <div className="cart-item-controls">
                    <input 
                      type="number" 
                      min="1" 
                      value={c.quantity}
                      onChange={e => updateQty(c.id, Number(e.target.value))}
                      className="quantity-input transition-all"
                    />
                    <button 
                      className="delete-item-btn btn-danger"
                      onClick={() => removeFromCart(c.id)}
                      title="Remove item from cart"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-total-section" style={{ flexShrink: 0, padding: 'var(--spacing-4) var(--spacing-6)' }}>
            <div className="cart-total" style={{ marginBottom: 'var(--spacing-4)', padding: 'var(--spacing-3)', fontSize: 'var(--font-size-lg)' }}>
              <span className="total-label">Total:</span>
              <span className="total-amount">${total.toFixed(2)}</span>
            </div>
            
            <div className="checkout-buttons" style={{ gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-3)' }}>
              <button 
                className="checkout-button btn-success hover-glow transition-all"
                onClick={() => checkout('cash')}
                disabled={cart.length === 0}
                style={{ padding: 'var(--spacing-3) var(--spacing-6)', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
              >
                💵 PAY CASH
              </button>
              <button 
                className="checkout-button btn-primary hover-glow transition-all"
                onClick={() => checkout('card')}
                disabled={cart.length === 0}
                style={{ padding: 'var(--spacing-3) var(--spacing-6)', minHeight: '48px', fontSize: 'var(--font-size-base)' }}
              >
                💳 PAY CARD
              </button>
            </div>

            {/* Reader Status */}
            <div className="status-bar" style={{ padding: 'var(--spacing-2) var(--spacing-3)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--spacing-2)' }}>
              <div className="status-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <span className={`status-dot ${reader ? '' : 'error'}`}></span>
                  {reader ? 'Card Reader Connected' : 'Card Reader Disconnected'}
                </div>
                {!reader && (
                  <button 
                    onClick={retryReaderConnection}
                    className="btn-secondary"
                    style={{ 
                      padding: 'var(--spacing-1) var(--spacing-2)', 
                      fontSize: 'var(--font-size-xs)',
                      border: '1px solid var(--gray-300)',
                      borderRadius: 'var(--border-radius-sm)',
                      background: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title="Retry connection to payment terminal"
                  >
                    🔄 Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;