import React, { useState, useCallback } from 'react';
import axios from 'axios';

const ProductFolderView = ({ 
  products, 
  folders, 
  onProductUpdate, 
  onMoveProduct,
  backendUrl,
  isInventoryMode = false,
  showOtherProduct = false,
  onOtherProductClick 
}) => {
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [draggedProduct, setDraggedProduct] = useState(null);

  // Organize products by folder
  const organizeProductsByFolder = useCallback(() => {
    const organized = {};

    // Initialize folders
    folders.forEach(folder => {
      organized[folder.id] = {
        folder,
        products: []
      };
    });

    // Check if there's already an "Unassigned" folder in the database
    const existingUnassignedFolder = folders.find(f => 
      f.name.toLowerCase() === 'unassigned'
    );

    // Only add virtual unassigned folder if no real one exists
    if (!existingUnassignedFolder) {
      organized['unassigned'] = {
        folder: { 
          id: 'unassigned', 
          name: 'Unassigned', 
          icon: '📦', 
          color: '#6c757d',
          description: 'Products not assigned to any folder'
        },
        products: []
      };
    }

    // Organize products
    products.forEach(product => {
      if (product.folderId && organized[product.folderId]) {
        organized[product.folderId].products.push(product);
      } else if (existingUnassignedFolder) {
        // If there's a real Unassigned folder, put unassigned products there
        if (!organized[existingUnassignedFolder.id]) {
          organized[existingUnassignedFolder.id] = {
            folder: existingUnassignedFolder,
            products: []
          };
        }
        organized[existingUnassignedFolder.id].products.push(product);
      } else {
        // Otherwise use the virtual unassigned folder
        organized['unassigned'].products.push(product);
      }
    });

    return organized;
  }, [products, folders]);

  const organizedProducts = organizeProductsByFolder();

  const toggleFolder = (folderId) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const expandAll = () => {
    const allFolderIds = Object.keys(organizedProducts);
    setExpandedFolders(new Set(allFolderIds));
  };

  const collapseAll = () => {
    setExpandedFolders(new Set());
  };

  const handleDragStart = (e, product) => {
    setDraggedProduct(product);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, targetFolderId) => {
    e.preventDefault();
    
    if (!draggedProduct || !targetFolderId || targetFolderId === 'unassigned') {
      setDraggedProduct(null);
      return;
    }

    // Check if product is already in this folder
    if (draggedProduct.folderId === targetFolderId) {
      setDraggedProduct(null);
      return;
    }

    try {
      const response = await axios.put(
        `${backendUrl}/mongodb/products/${draggedProduct._id}/folder`,
        { folderId: targetFolderId }
      );

      if (response.data.success && onMoveProduct) {
        onMoveProduct(draggedProduct._id, targetFolderId);
      }
    } catch (error) {
      console.error('Error moving product:', error);
    } finally {
      setDraggedProduct(null);
    }
  };

  return (
    <div className="product-folder-view">
      <div className="folder-view-controls">
        <button className="btn-secondary" onClick={expandAll}>
          📖 Expand All
        </button>
        <button className="btn-secondary" onClick={collapseAll}>
          📕 Collapse All
        </button>
      </div>

      <div className="folders-container">
        {Object.entries(organizedProducts).map(([folderId, { folder, products: folderProducts }]) => {
          const isExpanded = expandedFolders.has(folderId);
          const hasProducts = folderProducts.length > 0;

          // Skip empty folders unless in inventory mode or it's the unassigned folder
          if (!hasProducts && !isInventoryMode && folderId !== 'unassigned') {
            return null;
          }

          return (
            <div 
              key={folderId} 
              className={`folder-section ${isExpanded ? 'expanded' : ''}`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, folderId)}
            >
              <div 
                className="folder-header"
                onClick={() => toggleFolder(folderId)}
                style={{ borderLeft: `4px solid ${folder.color}` }}
              >
                <div className="folder-header-info">
                  <span className="folder-icon">{folder.icon}</span>
                  <div className="folder-details">
                    <h3 className="folder-title">{folder.name}</h3>
                    {folder.description && (
                      <p className="folder-description">{folder.description}</p>
                    )}
                  </div>
                  <span className="product-count">
                    {folderProducts.length} item{folderProducts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>
                  ▼
                </span>
              </div>

              {isExpanded && (
                <div className="folder-products">
                  {folderProducts.length === 0 ? (
                    <div className="empty-folder">
                      <p>No products in this folder</p>
                      {isInventoryMode && (
                        <p className="hint">Drag products here to organize them</p>
                      )}
                    </div>
                  ) : (
                    <div className="products-grid">
                      {folderProducts.map((product) => (
                          <div
                            key={product._id || product.id}
                            className={`product-card ${
                              draggedProduct && draggedProduct._id === product._id ? 'dragging' : ''
                            } ${isInventoryMode ? 'inventory-mode' : 'customer-mode'}`}
                            draggable={isInventoryMode}
                            onDragStart={(e) => isInventoryMode && handleDragStart(e, product)}
                            onClick={() => !isInventoryMode && onProductUpdate && onProductUpdate('click', product)}
                            style={{ cursor: !isInventoryMode ? 'pointer' : 'default' }}
                          >
                          <div className="product-header">
                            <h4 className="product-name">{product.name}</h4>
                            {product.category && product.category !== folder.name && (
                              <span className="product-category">{product.category}</span>
                            )}
                          </div>
                          
                          <div className="product-details">
                            <div className="product-price">${product.price.toFixed(2)}</div>
                            <div className={`product-stock ${
                              product.quantity > 15 ? 'high' : 
                              product.quantity > 5 ? 'medium' : 'low'
                            }`}>
                              Stock: {product.quantity}
                            </div>
                          </div>

                          {product.description && (
                            <div className="product-description">
                              {product.description.length > 60 
                                ? `${product.description.substring(0, 60)}...`
                                : product.description
                              }
                            </div>
                          )}

                          {isInventoryMode && (
                            <div className="product-actions">
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => onProductUpdate && onProductUpdate('edit', product)}
                              >
                                ✏️ Edit
                              </button>
                              <div className="drag-handle">⋮⋮</div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Other Product Option - only show in customer mode */}
      {showOtherProduct && !isInventoryMode && (
        <div className="other-product-section">
          <div 
            className="product-card other-product-card"
            onClick={onOtherProductClick}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: '2px dashed rgba(255, 255, 255, 0.3)',
              cursor: 'pointer',
              textAlign: 'center',
              minHeight: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              margin: '16px 0'
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🧮</div>
            <h4 className="product-name" style={{ color: 'white', margin: '4px 0' }}>Other Product</h4>
            <div className="product-price" style={{ color: 'white' }}>Custom Amount</div>
            <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>
              Click to enter custom amount
            </div>
          </div>
        </div>
      )}

      {draggedProduct && (
        <div className="drag-overlay">
          <div className="drag-info">
            Moving: {draggedProduct.name}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductFolderView;