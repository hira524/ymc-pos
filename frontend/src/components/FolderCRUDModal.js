import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const FolderCRUDModal = ({ 
  action, 
  folder, 
  folders, 
  backendUrl, 
  onClose, 
  onFolderUpdated, 
  onOpenFolderCRUD,
  showAlert,
  showConfirmDialog 
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    order: 0
  });
  const [loading, setLoading] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showProductAssignment, setShowProductAssignment] = useState(false);

  // Predefined folder colors and icons - REMOVED AS REQUESTED

  // Load products for assignment
  const loadProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/mongodb/inventory`);
      setAllProducts(response.data || []);
      
      // If editing a folder, get products assigned to this folder
      if (action === 'edit' && folder) {
        const folderProducts = response.data.filter(product => 
          product.folderId === folder.id
        );
        setSelectedProducts(folderProducts.map(p => p._id));
      }
    } catch (error) {
      console.error('Error loading products:', error);
      showAlert('**Failed to Load Products**\n\nCould not load products for assignment.', 'error');
    }
  }, [backendUrl, action, folder, showAlert]);

  // Assign products to folder
  const assignProductsToFolder = async (folderId, productIds) => {
    try {
      for (const productId of productIds) {
        await axios.put(`${backendUrl}/mongodb/inventory/${productId}/move-folder`, {
          folderId: folderId
        });
      }
    } catch (error) {
      console.error('Error assigning products to folder:', error);
      showAlert('**Product Assignment Failed**\n\nSome products could not be assigned to the folder.', 'warning');
    }
  };

  // Toggle product selection
  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  useEffect(() => {
    if (action === 'edit' && folder) {
      setFormData({
        name: folder.name || '',
        description: folder.description || '',
        order: folder.order || 0
      });
    } else if (action === 'create') {
      // Set default order for new folders
      const maxOrder = Math.max(...folders.map(f => f.order || 0), 0);
      setFormData({
        name: '',
        description: '',
        order: maxOrder + 1
      });
    }
    
    // Load products for assignment (for create and edit actions)
    if (action === 'create' || action === 'edit') {
      loadProducts();
    }
  }, [action, folder, folders, backendUrl, loadProducts]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      showAlert('**Folder Name Required**\n\nPlease enter a folder name.', 'warning');
      return;
    }

    // Check for duplicate names (excluding current folder if editing)
    const existingFolder = folders.find(f => 
      f.name.toLowerCase() === formData.name.trim().toLowerCase() && 
      f.id !== folder?.id
    );
    
    if (existingFolder) {
      showAlert('**Duplicate Folder Name**\n\nA folder with this name already exists. Please choose a different name.', 'warning');
      return;
    }

    setLoading(true);
    
    try {
      const folderData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        order: parseInt(formData.order)
      };

      let createdFolder = null;
      
      console.log('Backend URL:', backendUrl);
      console.log('Folder Data:', folderData);
      
      if (action === 'create') {
        console.log('Making POST request to:', `${backendUrl}/mongodb/folders`);
        const response = await axios.post(`${backendUrl}/mongodb/folders`, folderData);
        createdFolder = response.data.folder;
        showAlert(`**Folder Created**\n\n"${folderData.name}" has been created successfully.`, 'success');
      } else if (action === 'edit') {
        console.log('Making PUT request to:', `${backendUrl}/mongodb/folders/${folder.id}`);
        await axios.put(`${backendUrl}/mongodb/folders/${folder.id}`, folderData);
        createdFolder = { id: folder.id, ...folderData };
        showAlert(`**Folder Updated**\n\n"${folderData.name}" has been updated successfully.`, 'success');
      }

      // Assign selected products to the folder
      if (selectedProducts.length > 0 && createdFolder) {
        await assignProductsToFolder(createdFolder.id, selectedProducts);
      }

      onFolderUpdated();
      onClose();
    } catch (error) {
      console.error('Error saving folder:', error);
      console.error('Error response:', error.response);
      console.error('Error request config:', error.config);
      
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          'Unknown error occurred';
      
      showAlert(`**Save Failed**\n\nError: ${errorMessage}\nStatus: ${error.response?.status || 'Unknown'}\nURL: ${error.config?.url || 'Unknown'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (folderId, folderName) => {
    // First, check how many products are in this folder
    const productsInFolder = allProducts.filter(product => product.folderId === folderId);
    const productCount = productsInFolder.length;
    
    if (productCount === 0) {
      // No products, simple delete
      const confirmAction = async () => {
        setLoading(true);
        try {
          await axios.delete(`${backendUrl}/mongodb/folders/${folderId}`);
          showAlert(`**Folder Deleted**\n\n"${folderName}" has been deleted successfully.`, 'success');
          onFolderUpdated();
          onClose();
        } catch (error) {
          console.error('Error deleting folder:', error);
          showAlert(`**Delete Failed**\n\n${error.response?.data?.error || error.message}`, 'error');
        } finally {
          setLoading(false);
        }
      };

      showConfirmDialog(
        `Are you sure you want to delete the folder "${folderName}"?\n\nThis action cannot be undone.`,
        confirmAction
      );
    } else {
      // Folder has products, show advanced delete options
      handleAdvancedDelete(folderId, folderName, productCount);
    }
  };

  const handleAdvancedDelete = (folderId, folderName, productCount) => {
    const deleteOptionsHtml = `
      <div style="text-align: left; margin: 20px 0;">
        <p><strong>The folder "${folderName}" contains ${productCount} product(s).</strong></p>
        <p>What would you like to do with the products?</p>
        <div style="margin: 15px 0;">
          <label style="display: block; margin: 10px 0; cursor: pointer;">
            <input type="radio" name="deleteOption" value="moveProducts" checked style="margin-right: 8px;">
            <strong>Move products to "Unassigned" folder</strong><br>
            <small style="color: #666; margin-left: 20px;">Products will be preserved and moved to the Unassigned folder</small>
          </label>
          <label style="display: block; margin: 10px 0; cursor: pointer;">
            <input type="radio" name="deleteOption" value="deleteProducts" style="margin-right: 8px;">
            <strong>Delete products permanently</strong><br>
            <small style="color: #666; margin-left: 20px;">⚠️ Both folder and all products will be permanently deleted</small>
          </label>
        </div>
      </div>
    `;

    const customDialog = document.createElement('div');
    customDialog.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: white; border-radius: 12px; padding: 24px; max-width: 500px; width: 90%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.15); z-index: 11002; border: 1px solid #e0e0e0;
    `;

    customDialog.innerHTML = `
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="width: 60px; height: 60px; background: #ff6b6b; border-radius: 50%; 
                    margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <span style="color: white; font-size: 24px;">⚠️</span>
        </div>
        <h3 style="margin: 0; color: #333; font-size: 20px;">Delete Folder</h3>
      </div>
      ${deleteOptionsHtml}
      <div style="display: flex; gap: 12px; justify-content: center; margin-top: 24px;">
        <button type="button" id="cancelDelete" style="
          padding: 12px 24px; border: 1px solid #ddd; border-radius: 8px; 
          background: white; color: #333; cursor: pointer; font-size: 14px;
        ">Cancel</button>
        <button type="button" id="confirmDelete" style="
          padding: 12px 24px; border: none; border-radius: 8px; 
          background: #ff6b6b; color: white; cursor: pointer; font-size: 14px;
        ">Delete Folder</button>
      </div>
    `;

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.5); z-index: 11001;
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(customDialog);

    const handleClose = () => {
      document.body.removeChild(overlay);
      document.body.removeChild(customDialog);
    };

    customDialog.querySelector('#cancelDelete').onclick = handleClose;
    
    customDialog.querySelector('#confirmDelete').onclick = async () => {
      const selectedOption = customDialog.querySelector('input[name="deleteOption"]:checked').value;
      handleClose();
      
      setLoading(true);
      try {
        if (selectedOption === 'moveProducts') {
          // Delete folder only, move products to Unassigned
          await axios.delete(`${backendUrl}/mongodb/folders/${folderId}?moveProducts=true`);
          showAlert(`**Folder Deleted**\n\n"${folderName}" has been deleted. ${productCount} product(s) have been moved to "Unassigned".`, 'success');
        } else {
          // Delete folder and all products
          await axios.delete(`${backendUrl}/mongodb/folders/${folderId}?deleteProducts=true`);
          showAlert(`**Folder and Products Deleted**\n\n"${folderName}" and all ${productCount} product(s) have been permanently deleted.`, 'success');
        }
        onFolderUpdated();
        onClose();
      } catch (error) {
        console.error('Error deleting folder:', error);
        showAlert(`**Delete Failed**\n\n${error.response?.data?.error || error.message}`, 'error');
      } finally {
        setLoading(false);
      }
    };

    overlay.onclick = handleClose;
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit} style={{ marginTop: 'var(--spacing-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--spacing-3)' }}>
        {/* Folder Name */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600',
            color: 'var(--text-color)'
          }}>
            Folder Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Enter folder name"
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              fontSize: 'var(--font-size-base)',
              background: 'var(--input-background)',
              color: 'var(--text-color)'
            }}
            required
          />
        </div>

        {/* Folder Description */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600',
            color: 'var(--text-color)'
          }}>
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Optional description for this folder"
            rows={3}
            style={{
              width: '100%',
              padding: '12px',
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              fontSize: 'var(--font-size-base)',
              background: 'var(--input-background)',
              color: 'var(--text-color)',
              resize: 'vertical',
              minHeight: '80px'
            }}
          />
        </div>

        {/* Order */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600',
            color: 'var(--text-color)'
          }}>
            Display Order
          </label>
          <input
            type="number"
            value={formData.order}
            onChange={(e) => setFormData(prev => ({ ...prev, order: e.target.value }))}
            min="0"
            style={{
              width: '100px',
              padding: '12px',
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              fontSize: 'var(--font-size-base)',
              background: 'var(--input-background)',
              color: 'var(--text-color)'
            }}
          />
          <small style={{ 
            display: 'block', 
            marginTop: '4px', 
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-xs)'
          }}>
            Lower numbers appear first in the list
          </small>
        </div>

        {/* Product Assignment */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <label style={{ 
              fontWeight: '600',
              color: 'var(--text-color)'
            }}>
              Assign Products to Folder
            </label>
            <button
              type="button"
              onClick={() => setShowProductAssignment(!showProductAssignment)}
              style={{
                padding: '4px 8px',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                background: '#007bff',
                color: 'white',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer'
              }}
            >
              {showProductAssignment ? '🔼 Hide Products' : '🔽 Show Products'}
            </button>
          </div>
          
          {showProductAssignment && (
            <div style={{
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              padding: 'var(--spacing-2)',
              maxHeight: '200px',
              overflowY: 'auto',
              background: 'var(--input-background)'
            }}>
              {allProducts.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  color: 'var(--text-secondary)',
                  padding: 'var(--spacing-2)'
                }}>
                  No products available
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {allProducts.map(product => (
                    <label
                      key={product._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--border-radius)',
                        background: selectedProducts.includes(product._id) 
                          ? 'rgba(40, 167, 69, 0.1)' 
                          : 'var(--card-background)',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product._id)}
                        onChange={() => toggleProductSelection(product._id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500' }}>{product.name}</div>
                        <div style={{ 
                          fontSize: 'var(--font-size-xs)', 
                          color: 'var(--text-secondary)'
                        }}>
                          ${product.price} • Qty: {product.quantity}
                          {product.folderName && ` • Currently in: ${product.folderName}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              
              {selectedProducts.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'rgba(40, 167, 69, 0.1)',
                  borderRadius: 'var(--border-radius)',
                  fontSize: 'var(--font-size-sm)',
                  color: '#28a745'
                }}>
                  📦 {selectedProducts.length} product(s) selected for assignment
                </div>
              )}
            </div>
          )}
        </div>

        {/* Preview */}
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600',
            color: 'var(--text-color)'
          }}>
            Preview
          </label>
          <div style={{
            padding: 'var(--spacing-3)',
            border: '2px solid var(--border-color)',
            borderRadius: 'var(--border-radius)',
            background: 'var(--card-background)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: '#667eea',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              📁
            </div>
            <div>
              <div style={{ fontWeight: '600', fontSize: 'var(--font-size-base)' }}>
                {formData.name || 'Folder Name'}
              </div>
              {formData.description && (
                <div style={{ 
                  fontSize: 'var(--font-size-sm)', 
                  color: 'var(--text-secondary)',
                  marginTop: '2px'
                }}>
                  {formData.description}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        marginTop: 'var(--spacing-4)',
        paddingTop: 'var(--spacing-3)',
        borderTop: '1px solid var(--border-color)'
      }}>
        <div>
          {action === 'edit' && (
            <button
              type="button"
              onClick={() => handleDelete(folder.id, folder.name)}
              disabled={loading}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                background: '#dc3545',
                color: 'white',
                fontSize: 'var(--font-size-base)',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              🗑️ Delete Folder
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '12px 24px',
              border: '2px solid var(--border-color)',
              borderRadius: 'var(--border-radius)',
              background: 'var(--card-background)',
              color: 'var(--text-color)',
              fontSize: 'var(--font-size-base)',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !formData.name.trim()}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: 'var(--border-radius)',
              background: loading || !formData.name.trim() ? '#ccc' : '#28a745',
              color: 'white',
              fontSize: 'var(--font-size-base)',
              fontWeight: '600',
              cursor: loading || !formData.name.trim() ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '⏳ Saving...' : action === 'create' ? '➕ Create Folder' : '💾 Update Folder'}
          </button>
        </div>
      </div>
    </form>
  );

  const renderFolderList = () => (
    <div style={{ marginTop: 'var(--spacing-3)' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 'var(--spacing-3)'
      }}>
        <h4 style={{ margin: 0, color: 'var(--text-color)' }}>
          All Folders ({folders.length})
        </h4>
        <button
          onClick={() => onOpenFolderCRUD('create')}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 'var(--border-radius)',
            background: '#28a745',
            color: 'white',
            fontSize: 'var(--font-size-sm)',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          ➕ New Folder
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gap: 'var(--spacing-2)',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        {folders.length === 0 ? (
          <div style={{
            padding: 'var(--spacing-4)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--border-radius)'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>📁</div>
            <div>No folders created yet</div>
            <div style={{ fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
              Click "New Folder" to create your first folder
            </div>
          </div>
        ) : (
          folders
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(folder => (
              <div
                key={folder.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--spacing-3)',
                  border: '2px solid var(--border-color)',
                  borderRadius: 'var(--border-radius)',
                  background: 'var(--card-background)',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    background: '#667eea',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                  }}>
                    📁
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: '600', 
                      fontSize: 'var(--font-size-base)',
                      marginBottom: '2px'
                    }}>
                      {folder.name}
                    </div>
                    {folder.description && (
                      <div style={{ 
                        fontSize: 'var(--font-size-sm)', 
                        color: 'var(--text-secondary)'
                      }}>
                        {folder.description}
                      </div>
                    )}
                    <div style={{ 
                      fontSize: 'var(--font-size-xs)', 
                      color: 'var(--text-secondary)',
                      marginTop: '4px'
                    }}>
                      {folder.productCount || 0} products • Order: {folder.order || 0}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => onOpenFolderCRUD('edit', folder)}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 'var(--border-radius)',
                      background: '#007bff',
                      color: 'white',
                      fontSize: 'var(--font-size-sm)',
                      cursor: 'pointer'
                    }}
                    title="Edit folder"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => handleDelete(folder.id, folder.name)}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 'var(--border-radius)',
                      background: '#dc3545',
                      color: 'white',
                      fontSize: 'var(--font-size-sm)',
                      cursor: 'pointer'
                    }}
                    title="Delete folder"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 11000
    }}>
      <div style={{
        background: 'var(--card-background)',
        borderRadius: 'var(--border-radius)',
        width: '90%',
        maxWidth: action === 'list' ? '900px' : '600px',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '2px solid var(--border-color)',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
      }}>
        {/* Header */}
        <div style={{
          background: action === 'create' ? '#28a745' : action === 'edit' ? '#007bff' : '#667eea',
          color: 'white',
          padding: 'var(--spacing-4)',
          borderRadius: 'var(--border-radius) var(--border-radius) 0 0'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--font-size-xl)', fontWeight: '700' }}>
                {action === 'create' && '➕ Create New Folder'}
                {action === 'edit' && `✏️ Edit "${folder?.name}"`}
                {action === 'list' && '🗂️ Manage All Folders'}
              </h3>
              <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: 'var(--font-size-sm)' }}>
                {action === 'create' && 'Create a new folder to organize your products'}
                {action === 'edit' && 'Modify folder settings and appearance'}
                {action === 'list' && 'View, edit, and delete your product folders'}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                color: 'white',
                fontSize: '18px',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--spacing-4)' }}>
          {(action === 'create' || action === 'edit') && renderForm()}
          {action === 'list' && renderFolderList()}
        </div>
      </div>
    </div>
  );
};

export default FolderCRUDModal;