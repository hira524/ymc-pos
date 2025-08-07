import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { loadStripeTerminal } from '@stripe/terminal-js';
import ThemeToggle from './ThemeToggle';
import './App.css';
import './components.css';
import './themes.css';
import './animations.css';
import './pos.css';

function App() {
  const [inventory, setInventory] = useState([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [terminal, setTerminal] = useState(null);
  const [reader, setReader] = useState(null);

  useEffect(() => {
    // 1) Fetch inventory
    axios.get('http://localhost:5000/inventory')
      .then(r => setInventory(r.data))
      .catch(e => console.error('Inventory fetch error:', e.response?.data || e.message));

    // 2) Init Stripe Terminal with simulated mode
    loadStripeTerminal().then(StripeTerminal => {
      const term = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          try {
            const r = await axios.post('http://localhost:5000/connection_token');
            return r.data.secret;
          } catch (error) {
            console.error('Connection token error:', error.response?.data || error.message);
            alert('❌ Stripe key error: ' + (error.response?.data?.error || error.message));
            throw error;
          }
        },
        onUnexpectedReaderDisconnect: () => alert('⚠️ Reader disconnected')
      });
      setTerminal(term);

      // For production with live keys and physical readers
      // Set simulated: false to discover real BBPOS readers
      term.discoverReaders({ simulated: false })
        .then(({ discoveredReaders, error }) => {
          if (error) {
            console.error('Discover readers error:', error);
            return alert('Discover failed: ' + error.message);
          }
          if (discoveredReaders.length === 0) return alert('No physical readers found. Make sure BBPOS reader is on same network and powered on.');
          
          console.log('Found readers:', discoveredReaders);
          // Connect to the first discovered reader (BBPOS WisePOS)
          return term.connectReader(discoveredReaders[0]);
        })
        .then(({ reader, error }) => {
          if (error) {
            console.error('Connect reader error:', error);
            return alert('Connect reader failed: ' + error.message);
          }
          setReader(reader);
          console.log('✅ Connected to BBPOS WisePOS reader:', reader.id);
        })
        .catch(error => {
          console.error('Stripe Terminal initialization error:', error);
        });
    });
  }, []);

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
    await axios.post('http://localhost:5000/update-inventory', { cart })
      .catch(e => console.error('Update inv error:', e.response?.data || e.message));
    // 2) Log payment
    await axios.post('http://localhost:5000/log-payment', {
      items: cart,
      total,
      method
    }).catch(e => console.error('Log payment error:', e.response?.data || e.message));

    setCart([]);
    setTotal(0);
    alert('✅ Transaction complete (' + method + ')');
  };

  const checkout = async method => {
    if (cart.length === 0) return alert('Cart is empty');
    if (method === 'cash') return complete('cash');

    if (!terminal || !reader) return alert('No Stripe reader connected');
    const amount = Math.round(total * 100);
    
    try {
      // Create payment intent
      const response = await axios.post('http://localhost:5000/create_payment_intent', { amount });
      const { client_secret } = response.data;
      
      if (!client_secret) {
        return alert('Failed to create payment intent: No client secret received');
      }

      // Collect payment method
      const { error: collectErr, paymentIntent } = await terminal.collectPaymentMethod(client_secret);
      if (collectErr) return alert('Collect error: ' + collectErr.message);

      // Process payment
      const { error: processErr } = await terminal.processPayment(paymentIntent);
      if (processErr) return alert('Process error: ' + processErr.message);

      complete('card');
    } catch (error) {
      console.error('Payment error:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown payment error';
      alert('Payment failed: ' + errorMessage);
    }
  };

  return (
    <div className="app">
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
              <div className="status-item">
                <span className={`status-dot ${reader ? '' : 'error'}`}></span>
                {reader ? 'Card Reader Connected' : 'Card Reader Disconnected'}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;