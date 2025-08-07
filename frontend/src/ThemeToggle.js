import React, { useState, useEffect } from 'react';

const ThemeToggle = () => {
  const [theme, setTheme] = useState('light');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleThemeChange = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    
    setIsAnimating(true);
    
    // Trigger slide animation
    setTimeout(() => {
      setTheme(newTheme);
      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    }, 150);
  };

  return (
    <div className="theme-toggle-container">
      <button 
        className={`theme-toggle ${theme} ${isAnimating ? 'animating' : ''}`}
        onClick={handleThemeChange}
        disabled={isAnimating}
      >
        <div className="toggle-track">
          <div className="toggle-icons">
            <span className="icon-light">☀️</span>
            <span className="icon-dark">🌙</span>
          </div>
          <div className={`toggle-thumb ${theme}`}></div>
        </div>
      </button>
    </div>
  );
};

export default ThemeToggle;
