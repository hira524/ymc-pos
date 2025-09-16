import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const FolderManager = ({ 
  isOpen, 
  onClose, 
  onFoldersUpdated, 
  backendUrl 
}) => {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [newFolder, setNewFolder] = useState({
    name: '',
    description: '',
    color: '#667eea',
    icon: '📁'
  });
  const [draggedFolderId, setDraggedFolderId] = useState(null);

  const fetchFolders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/mongodb/folders`);
      if (response.data.success) {
        setFolders(response.data.folders);
      }
    } catch (error) {
      console.error('Error fetching folders:', error);
    } finally {
      setLoading(false);
    }
  }, [backendUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchFolders();
    }
  }, [isOpen, fetchFolders]);

  const createFolder = async () => {
    if (!newFolder.name.trim()) return;

    try {
      const response = await axios.post(`${backendUrl}/mongodb/folders`, newFolder);
      if (response.data.success) {
        await fetchFolders();
        setNewFolder({ name: '', description: '', color: '#667eea', icon: '📁' });
        setShowCreateModal(false);
        onFoldersUpdated && onFoldersUpdated();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert(error.response?.data?.error || 'Failed to create folder');
    }
  };

  const updateFolder = async () => {
    if (!editingFolder || !newFolder.name.trim()) return;

    try {
      const response = await axios.put(`${backendUrl}/mongodb/folders/${editingFolder.id}`, newFolder);
      if (response.data.success) {
        await fetchFolders();
        setEditingFolder(null);
        setNewFolder({ name: '', description: '', color: '#667eea', icon: '📁' });
        onFoldersUpdated && onFoldersUpdated();
      }
    } catch (error) {
      console.error('Error updating folder:', error);
      alert(error.response?.data?.error || 'Failed to update folder');
    }
  };

  const deleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Are you sure you want to delete "${folderName}"? Products in this folder will be moved to the General folder.`)) {
      return;
    }

    try {
      const response = await axios.delete(`${backendUrl}/mongodb/folders/${folderId}`);
      if (response.data.success) {
        await fetchFolders();
        onFoldersUpdated && onFoldersUpdated();
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      alert(error.response?.data?.error || 'Failed to delete folder');
    }
  };

  const reorderFolders = async (newFolderOrder) => {
    try {
      const folderIds = newFolderOrder.map(folder => folder.id);
      await axios.put(`${backendUrl}/mongodb/folders/reorder`, { folderIds });
      await fetchFolders();
      onFoldersUpdated && onFoldersUpdated();
    } catch (error) {
      console.error('Error reordering folders:', error);
    }
  };

  const handleDragStart = (e, folderId) => {
    setDraggedFolderId(folderId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetFolderId) => {
    e.preventDefault();
    
    if (!draggedFolderId || draggedFolderId === targetFolderId) {
      setDraggedFolderId(null);
      return;
    }

    const draggedIndex = folders.findIndex(f => f.id === draggedFolderId);
    const targetIndex = folders.findIndex(f => f.id === targetFolderId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newFolders = [...folders];
    const [draggedFolder] = newFolders.splice(draggedIndex, 1);
    newFolders.splice(targetIndex, 0, draggedFolder);

    setFolders(newFolders);
    reorderFolders(newFolders);
    setDraggedFolderId(null);
  };

  const openCreateModal = () => {
    setNewFolder({ name: '', description: '', color: '#667eea', icon: '📁' });
    setEditingFolder(null);
    setShowCreateModal(true);
  };

  const openEditModal = (folder) => {
    setNewFolder({
      name: folder.name,
      description: folder.description || '',
      color: folder.color,
      icon: folder.icon
    });
    setEditingFolder(folder);
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingFolder(null);
    setNewFolder({ name: '', description: '', color: '#667eea', icon: '📁' });
  };

  const colorOptions = [
    '#667eea', '#764ba2', '#4facfe', '#00f2fe',
    '#43e97b', '#38f9d7', '#fa709a', '#fee140',
    '#667eea', '#a8edea', '#fad0c4', '#ffd1ff'
  ];

  const iconOptions = [
    '📁', '📂', '🏷️', '📦', '🍔', '🥤', '🧊', '🧃',
    '💧', '🛎️', '🎯', '⭐', '🔥', '💎', '🚀', '🎨'
  ];

  if (!isOpen) return null;

  return (
    <div className="folder-manager-overlay">
      <div className="folder-manager-modal">
        <div className="folder-manager-header">
          <h2>📁 Folder Management</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="folder-manager-content">
          <div className="folder-manager-actions">
            <button className="btn-success" onClick={openCreateModal}>
              ➕ Create New Folder
            </button>
          </div>

          {loading ? (
            <div className="loading-state">Loading folders...</div>
          ) : (
            <div className="folders-list">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className={`folder-card ${draggedFolderId === folder.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, folder.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, folder.id)}
                  style={{ borderLeft: `4px solid ${folder.color}` }}
                >
                  <div className="folder-card-header">
                    <div className="folder-info">
                      <span className="folder-icon" style={{ fontSize: '1.2rem' }}>
                        {folder.icon}
                      </span>
                      <div>
                        <h3 className="folder-name">{folder.name}</h3>
                        <p className="folder-description">{folder.description}</p>
                      </div>
                    </div>
                    <div className="folder-stats">
                      <span className="product-count">{folder.productCount} products</span>
                    </div>
                  </div>
                  
                  <div className="folder-card-actions">
                    <button 
                      className="btn-primary"
                      onClick={() => openEditModal(folder)}
                    >
                      ✏️ Edit
                    </button>
                    {!folder.isDefault && (
                      <button 
                        className="btn-danger"
                        onClick={() => deleteFolder(folder.id, folder.name)}
                      >
                        🗑️ Delete
                      </button>
                    )}
                    <div className="drag-handle">⋮⋮</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create/Edit Folder Modal */}
        {showCreateModal && (
          <div className="create-folder-overlay">
            <div className="create-folder-modal">
              <div className="create-folder-header">
                <h3>{editingFolder ? 'Edit Folder' : 'Create New Folder'}</h3>
                <button onClick={closeModal}>✕</button>
              </div>

              <div className="create-folder-content">
                <div className="form-group">
                  <label>Folder Name *</label>
                  <input
                    type="text"
                    value={newFolder.name}
                    onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                    placeholder="Enter folder name"
                    maxLength={50}
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    value={newFolder.description}
                    onChange={(e) => setNewFolder({ ...newFolder, description: e.target.value })}
                    placeholder="Optional description"
                    maxLength={200}
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label>Color</label>
                  <div className="color-picker">
                    {colorOptions.map(color => (
                      <button
                        key={color}
                        className={`color-option ${newFolder.color === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewFolder({ ...newFolder, color })}
                      />
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Icon</label>
                  <div className="icon-picker">
                    {iconOptions.map(icon => (
                      <button
                        key={icon}
                        className={`icon-option ${newFolder.icon === icon ? 'selected' : ''}`}
                        onClick={() => setNewFolder({ ...newFolder, icon })}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="folder-preview">
                  <h4>Preview:</h4>
                  <div 
                    className="preview-folder"
                    style={{ borderLeft: `4px solid ${newFolder.color}` }}
                  >
                    <span className="preview-icon">{newFolder.icon}</span>
                    <span className="preview-name">{newFolder.name || 'Folder Name'}</span>
                  </div>
                </div>
              </div>

              <div className="create-folder-actions">
                <button className="btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button 
                  className="btn-success" 
                  onClick={editingFolder ? updateFolder : createFolder}
                  disabled={!newFolder.name.trim()}
                >
                  {editingFolder ? '💾 Update' : '➕ Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FolderManager;