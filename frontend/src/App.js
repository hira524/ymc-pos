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

function App() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [terminal, setTerminal] = useState(null);
  const [reader, setReader] = useState(null);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [testMode, setTestMode] = useState(false);

  // Dynamic backend URL for different environments
  const getBackendUrl = () => {
    // Production environment (Netlify + Render)
    if (window.location.hostname.includes('netlify.app') || 
        window.location.hostname !== 'localhost') {
      return process.env.REACT_APP_BACKEND_URL || 'https://your-render-app.onrender.com';
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
      const { discoveredReaders, error } = await terminal.discoverReaders({ 
        simulated: true,
        // location: 'tml_GBoQHwGS5rcO0D'  // Required for registered BBPOS readers
      });

      if (error) {
        console.error('Retry discover readers error:', error);
        return showAlert(`**Retry Failed**\n\nStill unable to locate payment terminals.\n\n**Error:** ${error.message}\n\n*Please check device status and try again.*`, 'error');
      }

      if (discoveredReaders.length === 0) {
        return showAlert('**No Devices Found**\n\nNo payment terminals detected during retry.\n\n*Please ensure your device is powered on and connected.*', 'warning');
      }

      const reader = discoveredReaders[0];
      const { reader: connectedReader, error: connectError } = await terminal.connectReader(reader);

      if (connectError) {
        console.error('Retry connect reader error:', connectError);
        return showAlert(`**Retry Connection Failed**\n\n${connectError.message}\n\n*Please try again or contact support.*`, 'error');
      }

      setReader(connectedReader);
      showAlert(`**Reconnection Successful**\n\nPayment terminal is now ready for transactions.`, 'success');
    } catch (error) {
      console.error('Retry connection error:', error);
      showAlert(`**Retry Process Failed**\n\nUnable to complete reconnection attempt.\n\n**Error:** ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    // 1) Fetch Stripe configuration
    axios.get(`${BACKEND_URL}/stripe/config`)
      .then(r => {
        setTestMode(r.data.testMode);
        console.log('Stripe config loaded:', r.data.testMode ? 'TEST MODE' : 'LIVE MODE');
      })
      .catch(e => {
        console.warn('Could not fetch Stripe config:', e.message);
        // Default to test mode if config fetch fails
        setTestMode(true);
      });

    // 2) Fetch inventory
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

    // 2) Init Stripe Terminal with simulated mode
    loadStripeTerminal().then(StripeTerminal => {
      console.log('✅ Stripe Terminal library loaded successfully');
      
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
      showAlert('**Initializing Payment System**\n\nSearching for available payment terminals in your area.\n\nPlease wait while we establish connection...', 'info');

      // Auto-detect reader type based on environment and test mode
      const discoverConfig = testMode ? 
        { simulated: true } : // Test mode: use simulated readers
        { 
          simulated: false,
          location: process.env.REACT_APP_STRIPE_LOCATION_ID || 'tml_GBoQHwGS5rcO0D'
        };
      
      term.discoverReaders(discoverConfig)
        .then(({ discoveredReaders, error }) => {
          if (error) {
            console.error('Discover readers error:', error);
            return showAlert(`**Reader Discovery Failed**\n\nUnable to locate payment terminals in your area.\n\n**Error:** ${error.message}\n\n*Please ensure your payment device is powered on and connected to the network.*`, 'error');
          }
          if (discoveredReaders.length === 0) {
            return showAlert('**No Payment Terminals Found**\n\nNo compatible payment devices were detected at this location.\n\n**Please verify:**\n• BBPOS reader is powered on and ready\n• Device is connected to the same Wi-Fi network\n• Terminal status shows "online" in Stripe Dashboard\n• Device is within network range\n\n*Contact support if the issue persists.*', 'warning');
          }
          
          console.log('Found readers:', discoveredReaders);
          
          // Show success message for reader discovery
          showAlert(`**Payment Terminal Found**\n\nDiscovered ${discoveredReaders.length} compatible payment device${discoveredReaders.length > 1 ? 's' : ''}.\n\nAttempting to establish connection...`, 'success');
          
          // For BBPOS readers, check if pairing is required
          const reader = discoveredReaders[0];
          console.log('Attempting to connect to reader:', reader.id, reader.device_type);
          
          // Some readers require pairing with a code displayed on the device
          return term.connectReader(reader, {
            // If reader shows a pairing code, this function will be called
            onReaderDisplayPairingCode: (pairingCode) => {
              console.log('Pairing code displayed on reader:', pairingCode);
              showAlert(`**Device Pairing Required**\n\nYour BBPOS payment terminal is requesting secure pairing.\n\n**Pairing Code:** <span class="highlight">${pairingCode}</span>\n\n**Next Steps:**\n1. Check your BBPOS device screen\n2. Verify the pairing code matches: **${pairingCode}**\n3. Confirm the pairing on your device\n4. Click OK below to continue\n\n*This ensures secure communication between devices.*`, 'info');
            }
          });
        })
        .then(({ reader, error }) => {
          if (error) {
            console.error('Connect reader error:', error);
            return showAlert(`**Connection Failed**\n\nUnable to establish connection with the payment terminal.\n\n**Error Details:**\n${error.message}\n\n**Troubleshooting Steps:**\n• Restart the payment device\n• Check network connectivity\n• Ensure device is not connected elsewhere\n• Contact technical support if needed\n\n*Please try again after following these steps.*`, 'error');
          }
          setReader(reader);
          console.log('Connected to BBPOS WisePOS reader:', reader.id);
          
          // Show success alert for card reader connection
          showAlert(`**Card Reader Connected Successfully**\n\nPayment terminal "${reader.label || reader.id}" is now ready for transactions.\n\n*You can now accept card payments.*`, 'success');
        })
        .catch(error => {
          console.error('Stripe Terminal initialization error:', error);
          showAlert(`**Payment System Initialization Failed**\n\nUnable to initialize the Stripe Terminal payment system.\n\n**Error Details:**\n${error.message || 'Unknown initialization error'}\n\n**Possible Causes:**\n• Network connectivity issues\n• Invalid Stripe configuration\n• Browser compatibility problems\n• Missing payment terminal drivers\n\n**Solutions:**\n• Refresh the page and try again\n• Check your internet connection\n• Contact system administrator\n• Use cash payment as alternative\n\n*Card payments will not be available until this is resolved.*`, 'error');
        });
    });
  }, [BACKEND_URL]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const checkout = async method => {
    if (cart.length === 0) return showAlert('**Empty Cart**\n\nYour shopping cart is currently empty.\n\n*Please add some items before proceeding to checkout.*', 'warning');
    if (method === 'cash') return complete('cash');

    if (!terminal || !reader) return showAlert('**Payment Terminal Required**\n\nNo card payment terminal is currently connected.\n\n**For card payments:**\n• Ensure your payment device is powered on\n• Check device connectivity\n• Try reconnecting the terminal\n\n*Use cash payment as an alternative.*', 'error');
    const amount = Math.round(total * 100);
    
    try {
      // Create payment intent
      const response = await axios.post(`${BACKEND_URL}/create_payment_intent`, { amount });
      const { client_secret } = response.data;
      
      if (!client_secret) {
        return showAlert('**Payment Setup Failed**\n\nUnable to initialize secure payment processing.\n\n*This is usually a temporary server issue. Please try again in a moment.*\n\nIf the problem persists, contact technical support.', 'error');
      }

      // Collect payment method
      const { error: collectErr, paymentIntent } = await terminal.collectPaymentMethod(client_secret);
      if (collectErr) return showAlert(`**Payment Collection Error**\n\nUnable to collect payment information from the card terminal.\n\n**Error:** ${collectErr.message}\n\n*Please try inserting/swiping the card again or use a different payment method.*`, 'error');

      // Process payment
      const { error: processErr } = await terminal.processPayment(paymentIntent);
      if (processErr) return showAlert(`**Payment Processing Failed**\n\nThe payment could not be completed successfully.\n\n**Error:** ${processErr.message}\n\n**Next Steps:**\n• Try the transaction again\n• Use a different card\n• Contact your bank if the issue persists\n• Consider cash payment as alternative`, 'error');

      complete('card');
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown payment error';
      showAlert(`**Payment Transaction Failed**\n\nWe encountered an issue while processing your payment.\n\n**Technical Details:**\n${errorMessage}\n\n**What you can do:**\n• Verify card details and try again\n• Check your internet connection\n• Use a different payment method\n• Contact customer support for assistance\n\n*Your order has not been charged.*`, 'error');
    }
  };

  return (
    <div className="app">
      {/* Custom Alert Components */}
      <CustomAlert alert={currentAlert} onClose={closeAlert} />
      
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