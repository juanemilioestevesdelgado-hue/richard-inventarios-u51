import { inventoryU51, inventoryCC51, inventoryT51 } from './data.js?v=3';
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    getFirestore,
    collection,
    getDocs,
    onSnapshot,
    doc,
    setDoc,
    updateDoc,
    writeBatch
} from "firebase/firestore";

const inventoryMap = {
    'U51': inventoryU51,
    'CC51': inventoryCC51,
    'T51': inventoryT51
};

let currentUnit = localStorage.getItem('selectedUnit') || 'U51';
let currentCollection = `inventory_${currentUnit.toLowerCase()}`;
let fullInventory = inventoryMap[currentUnit];

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBDSvuzugExjjWS6wHhdoEXGeeNPz5FulY",
    authDomain: "inventario-u51.firebaseapp.com",
    projectId: "inventario-u51",
    storageBucket: "inventario-u51.firebasestorage.app",
    messagingSenderId: "520794533760",
    appId: "1:520794533760:web:10fd8b7cd0bea3d3401b65",
    measurementId: "G-EQFSQH4GEL"
};

const app = initializeApp(firebaseConfig);
let analytics;
try {
    analytics = getAnalytics(app);
} catch (e) {
    console.warn("Analytics blocked or failed to load");
}
const db = getFirestore(app);

const IMGBB_API_KEY = "6f61e5ee8f8afa155a55c439b13602e5";

let reviewedCount = 0;

document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.getElementById('inventory-body');
    const totalItemsEl = document.getElementById('total-items');
    const reviewedItemsEl = document.getElementById('reviewed-items');
    const modal = document.getElementById('image-modal');
    const modalImg = document.getElementById('modal-image');
    const closeModal = document.querySelector('.close-modal');

    let currentInventoryData = [];
    const searchInput = document.getElementById('search-input');

    tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center;">Cargando inventario desde Firebase...</td></tr>';

    // Splash screen handling
    const splashScreen = document.getElementById('splash-screen');
    const unitButtons = document.querySelectorAll('.unit-btn');
    const appContainer = document.querySelector('.app-container');
    const mainTitle = document.getElementById('main-title');

    const inventariadorInput = document.getElementById('inventariador-name');
    let inventariador = localStorage.getItem('inventariador') || '';
    if (inventariador) {
        inventariadorInput.value = inventariador;
    }

    const initAppForUnit = (unit) => {
        currentUnit = unit;
        localStorage.setItem('selectedUnit', unit);
        currentCollection = `inventory_${unit.toLowerCase()}`;
        fullInventory = inventoryMap[unit];
        mainTitle.textContent = `INVENTARIO ${unit}`;

        splashScreen.classList.add('hidden');
        appContainer.classList.add('visible');

        startRealtimeListener();
    };

    unitButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const name = inventariadorInput.value.trim();
            if (!name) {
                alert('Por favor, ingresa tu nombre antes de continuar.');
                return;
            }
            inventariador = name;
            localStorage.setItem('inventariador', name);
            initAppForUnit(btn.dataset.unit);
        });
    });

    // If unit is already selected, we could skip splash, but user wants it before entering.
    // However, if they just refreshed, maybe show it anyway.
    // For now, let's always show splash unless they click.

    let unsubscribe = null;

    function startRealtimeListener() {
        if (unsubscribe) unsubscribe();

        tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center;">Conectando con la base de datos...</td></tr>';

        unsubscribe = onSnapshot(collection(db, currentCollection), (snapshot) => {
            if (snapshot.empty) {
                console.log(`Database ${currentCollection} is empty. Populating...`);
                tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center;">Inicializando base de datos por primera vez...</td></tr>';
                const batch = writeBatch(db);
                fullInventory.forEach((item) => {
                    const docRef = doc(db, currentCollection, item.codigo);
                    batch.set(docRef, { ...item, estado: "", revisado: false, comentarios: "", fotoUrl: "" });
                });
                batch.commit();
                return;
            }

            currentInventoryData = [];
            let hasExpired = false;
            const todayStr = new Date().toISOString().split('T')[0];
            const batchUpdate = writeBatch(db);

            snapshot.forEach((docSnap) => {
                const item = { id: docSnap.id, ...docSnap.data() };

                if (item.revisado && item.proximaRevision && item.proximaRevision.trim() !== '' && item.proximaRevision < todayStr) {
                    item.revisado = false;
                    batchUpdate.update(doc(db, currentCollection, item.id), { revisado: false, ultimaRevision: "" });
                    hasExpired = true;
                }

                currentInventoryData.push(item);
            });

            if (hasExpired) {
                batchUpdate.commit().catch(e => console.error("Error auto-unchecking:", e));
            }

            currentInventoryData.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }));

            totalItemsEl.textContent = currentInventoryData.length;
            reviewedCount = currentInventoryData.filter(item => item.revisado).length;
            reviewedItemsEl.textContent = reviewedCount;

            const filter = searchInput.value.toLowerCase();
            const filteredData = currentInventoryData.filter(item =>
                (item.descripcion || '').toLowerCase().includes(filter) ||
                (item.codigo || '').toLowerCase().includes(filter)
            );

            const activeElementId = document.activeElement ? document.activeElement.id : null;
            const cursorPosition = document.activeElement ? document.activeElement.selectionStart : null;

            renderTable(filteredData, tableBody, totalItemsEl, reviewedItemsEl, modal, modalImg);

            if (activeElementId) {
                const el = document.getElementById(activeElementId);
                if (el) {
                    el.focus();
                    if (cursorPosition !== null && typeof el.setSelectionRange === 'function') {
                        el.setSelectionRange(cursorPosition, cursorPosition);
                    }
                }
            }
        }, (error) => {
            console.error("Snapshot error:", error);
            tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center; color: red;">Error en tiempo real. Revisa la consola.</td></tr>';
        });
    }

    // Search input listener
    searchInput.addEventListener('input', () => {
        const filter = searchInput.value.toLowerCase();
        const filteredData = currentInventoryData.filter(item =>
            (item.descripcion || '').toLowerCase().includes(filter) ||
            (item.codigo || '').toLowerCase().includes(filter)
        );
        renderTable(filteredData, tableBody, totalItemsEl, reviewedItemsEl, modal, modalImg);
    });

    function renderTable(inventoryData, tableBody, totalItemsEl, reviewedItemsEl, modal, modalImg) {
        tableBody.innerHTML = '';

        inventoryData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.id = `row-${item.id}`;
            if (item.revisado) tr.classList.add('completed');


            tr.innerHTML = `
                <td data-label="#" style="text-align: center; font-weight: bold; color: var(--accent);">${index + 1}</td>
                <td data-label="Foto">
                    <button class="toggle-btn" id="toggle-${item.id}">
                        <i class="ph ph-caret-right"></i>
                    </button>
                </td>
                <td data-label="Código"><strong>${item.codigo}</strong></td>
                <td data-label="SICAFI">${item.sicafi || ''}</td>
                <td data-label="PF">${item.pf || ''}</td>
                <td data-label="Descripción">${item.descripcion || ''}</td>
                <td data-label="Ubicación">${item.ubicacion || ''}</td>
                <td data-label="Marca">${item.marca || ''}</td>
                <td data-label="Modelo">${item.modelo || ''}</td>
                <td data-label="Serie">${item.serie || ''}</td>
                <td data-label="Estado">
                    <select class="status-select default" id="status-${item.id}" ${item.revisado ? 'disabled' : ''}>
                        <option value="" disabled ${!item.estado ? 'selected' : ''}>Seleccionar...</option>
                        <option value="bueno" ${item.estado === 'bueno' ? 'selected' : ''}>Bueno</option>
                        <option value="malo" ${item.estado === 'malo' ? 'selected' : ''}>Malo</option>
                        <option value="regular" ${item.estado === 'regular' ? 'selected' : ''}>Regular</option>
                        <option value="no-existe" ${item.estado === 'no-existe' ? 'selected' : ''}>No existe</option>
                    </select>
                </td>
                <td data-label="Fecha de Revisión">${item.ultimaRevision || '-'}</td>
                <td data-label="Revisión" class="action-column">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" class="custom-checkbox" id="check-${item.id}" ${item.revisado ? 'checked' : ''}>
                    </div>
                </td>
                <td data-label="Próxima Rev.">
                    <input type="date" class="comment-input date-input-inline" id="next-rev-${item.id}" value="${item.proximaRevision || ''}" style="padding: 4px; font-size: 0.85rem; width: 130px;" ${item.revisado ? 'disabled' : ''} max="9999-12-31">
                </td>
                <td data-label="Comentarios" class="action-column">
                    <textarea class="comment-input" id="comment-${item.id}" rows="1" placeholder="Agregar comentario..." ${item.revisado ? 'disabled' : ''}>${item.comentarios || ''}</textarea>
                </td>
                <td data-label="Acciones" class="action-column" style="display:flex; gap:15px; align-items:center; justify-content:center; padding-top:10px;">
                    <button class="icon-btn edit-item-btn" id="edit-${item.id}" title="Editar Item" style="color: ${item.revisado ? '#9ca3af' : '#3b82f6'}; background: none; border: none; cursor: ${item.revisado ? 'not-allowed' : 'pointer'}; font-size: 22px;" ${item.revisado ? 'disabled' : ''}><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn delete-item-btn" id="delete-item-${item.id}" title="Borrar Item" style="color: ${item.revisado ? '#9ca3af' : '#ef4444'}; background: none; border: none; cursor: ${item.revisado ? 'not-allowed' : 'pointer'}; font-size: 22px;" ${item.revisado ? 'disabled' : ''}><i class="ph ph-trash"></i></button>
                </td>
            `;

            tableBody.appendChild(tr);

            const photoTr = document.createElement('tr');
            photoTr.id = `photo-row-${item.id}`;
            photoTr.className = 'photo-row hidden';
            photoTr.innerHTML = `
                <td colspan="15">
                    <div class="photo-container">
                        <div class="upload-container">
                            <label for="file-${item.id}" class="upload-btn" id="label-${item.id}">
                                <i class="ph ph-camera"></i> Subir Fotografía
                            </label>
                            <input type="file" id="file-${item.id}" class="file-input" accept="image/*">
                            <button id="delete-photo-${item.id}" class="upload-btn ${item.fotoUrl ? '' : 'hidden'}" style="background: #ef4444; color: white; border: 2px solid darkred;">
                                <i class="ph ph-trash"></i> Borrar Foto
                            </button>
                        </div>
                        <img src="${item.fotoUrl || ''}" alt="Foto del item" class="photo-preview-large ${item.fotoUrl ? 'visible' : ''}" id="preview-${item.id}">
                    </div>
                </td>
            `;
            tableBody.appendChild(photoTr);

            // Toggle photo row
            const toggleBtn = tr.querySelector(`#toggle-${item.id}`);
            toggleBtn.addEventListener('click', () => {
                photoTr.classList.toggle('hidden');
                toggleBtn.classList.toggle('expanded');
            });

            // Checkbox (Revisión)
            const checkbox = tr.querySelector(`#check-${item.id}`);
            checkbox.addEventListener('change', async (e) => {
                const isChecked = e.target.checked;



                const updateData = { revisado: isChecked };

                if (isChecked) {
                    tr.classList.add('completed');
                    reviewedCount++;
                    // Set current date as Last Review if not already set or whenever checked
                    const today = new Date().toISOString().split('T')[0];
                    updateData.ultimaRevision = `${today} por ${inventariador}`;
                } else {
                    tr.classList.remove('completed');
                    reviewedCount--;
                    updateData.ultimaRevision = "";
                }

                reviewedItemsEl.textContent = reviewedCount;
                await updateDoc(doc(db, currentCollection, item.id), updateData);
            });

            // Comment
            const commentInput = tr.querySelector(`#comment-${item.id}`);
            let timeoutId;
            commentInput.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';
                clearTimeout(timeoutId);
                timeoutId = setTimeout(async () => {
                    await updateDoc(doc(db, currentCollection, item.id), { comentarios: e.target.value });
                }, 1000);
            });

            // Status select
            const statusSelect = tr.querySelector(`#status-${item.id}`);
            const updateSelectColor = (val) => {
                statusSelect.className = 'status-select';
                if (val === 'bueno') statusSelect.classList.add('status-bueno');
                if (val === 'malo') statusSelect.classList.add('status-malo');
                if (val === 'regular') statusSelect.classList.add('status-regular');
                if (val === 'no-existe') statusSelect.classList.add('status-no-existe');
            };
            if (item.estado) updateSelectColor(item.estado);
            statusSelect.addEventListener('change', async (e) => {
                updateSelectColor(e.target.value);
                await updateDoc(doc(db, currentCollection, item.id), { estado: e.target.value });
            });

            // Inline Proxima Revision
            const nextRevInput = tr.querySelector(`#next-rev-${item.id}`);
            nextRevInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val) {
                    const parts = val.split('-');
                    if (parts[0] && parts[0].length > 4) {
                        parts[0] = parts[0].substring(0, 4);
                        e.target.value = parts.join('-');
                    }
                }
            });
            nextRevInput.addEventListener('blur', async (e) => {
                if (item.proximaRevision !== e.target.value) {
                    await updateDoc(doc(db, currentCollection, item.id), { proximaRevision: e.target.value });
                }
            });



            // Delete Item
            const deleteItemBtn = tr.querySelector(`#delete-item-${item.id}`);
            if (deleteItemBtn) {
                deleteItemBtn.addEventListener('click', async () => {
                    if (!confirm(`¿Estás seguro de ELIMINAR el ítem ${item.codigo}? Esta acción no se puede deshacer.`)) return;
                    try {
                        const batch = writeBatch(db);
                        batch.delete(doc(db, currentCollection, item.id));
                        await batch.commit();
                        tr.remove();
                        photoTr.remove();
                        totalItemsEl.textContent = parseInt(totalItemsEl.textContent) - 1;
                        if (item.revisado) { reviewedCount--; reviewedItemsEl.textContent = reviewedCount; }
                    } catch (err) {
                        console.error(err);
                        alert("Error al eliminar item");
                    }
                });
            }

            // Edit Item
            const editBtn = tr.querySelector(`#edit-${item.id}`);
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    document.getElementById('edit-original-codigo').value = item.id;
                    document.getElementById('edit-codigo').value = item.codigo || '';
                    document.getElementById('edit-sicafi').value = item.sicafi || '';
                    document.getElementById('edit-pf').value = item.pf || '';
                    document.getElementById('edit-descripcion').value = item.descripcion || '';
                    document.getElementById('edit-ubicacion').value = item.ubicacion || '';
                    document.getElementById('edit-marca').value = item.marca || '';
                    document.getElementById('edit-modelo').value = item.modelo || '';
                    document.getElementById('edit-serie').value = item.serie || '';
                    document.getElementById('edit-estado').value = item.estado || '';
                    document.getElementById('edit-ultima-revision').value = item.ultimaRevision || '';
                    document.getElementById('edit-proxima-revision').value = item.proximaRevision || '';
                    document.getElementById('edit-revisado').checked = item.revisado || false;
                    document.getElementById('edit-comentarios').value = item.comentarios || '';
                    document.getElementById('edit-item-modal').classList.remove('hidden');
                });
            }

            // Photo upload (ImgBB)
            const fileInput = photoTr.querySelector(`#file-${item.id}`);
            const previewThumb = photoTr.querySelector(`#preview-${item.id}`);
            const labelBtn = photoTr.querySelector(`#label-${item.id}`);
            const deletePhotoBtn = photoTr.querySelector(`#delete-photo-${item.id}`);

            if (deletePhotoBtn) {
                deletePhotoBtn.addEventListener('click', async () => {
                    if (!confirm('¿Estás seguro de borrar esta foto?')) return;
                    deletePhotoBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Borrando...';
                    try {
                        await updateDoc(doc(db, currentCollection, item.id), { fotoUrl: "" });
                        previewThumb.src = "";
                        previewThumb.classList.remove('visible');
                        deletePhotoBtn.classList.add('hidden');
                        labelBtn.innerHTML = '<i class="ph ph-camera"></i> Subir Fotografía';
                        deletePhotoBtn.innerHTML = '<i class="ph ph-trash"></i> Borrar Foto';
                    } catch (error) {
                        console.error("Error deleting image:", error);
                        alert("Error al borrar la foto.");
                        deletePhotoBtn.innerHTML = '<i class="ph ph-trash"></i> Borrar Foto';
                    }
                });
            }

            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                labelBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Subiendo...';
                try {
                    const formData = new FormData();
                    formData.append("image", file);
                    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
                    const data = await response.json();
                    if (data.success) {
                        const imageUrl = data.data.url;
                        previewThumb.src = imageUrl;
                        previewThumb.classList.add('visible');
                        deletePhotoBtn.classList.remove('hidden');
                        await updateDoc(doc(db, currentCollection, item.id), { fotoUrl: imageUrl });
                        labelBtn.innerHTML = '<i class="ph ph-check"></i> Subida';
                    } else {
                        throw new Error("ImgBB error");
                    }
                } catch (error) {
                    console.error("Error uploading image:", error);
                    labelBtn.innerHTML = '<i class="ph ph-warning"></i> Error';
                }
            });

            previewThumb.addEventListener('click', () => {
                if (previewThumb.src) {
                    modalImg.src = previewThumb.src;
                    modal.classList.remove('hidden');
                }
            });
        });
    }

    // Close modal
    closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // Change unit button — return to splash
    const changeUnitBtn = document.getElementById('change-unit-btn');
    if (changeUnitBtn) {
        changeUnitBtn.addEventListener('click', () => {
            if (unsubscribe) unsubscribe();
            localStorage.removeItem('selectedUnit');
            appContainer.classList.remove('visible');
            splashScreen.classList.remove('hidden');
            tableBody.innerHTML = '';
            totalItemsEl.textContent = '0';
            reviewedItemsEl.textContent = '0';
            searchInput.value = '';
        });
    }

    // Sync button
    const syncBtn = document.getElementById('sync-btn');
    syncBtn.addEventListener('click', async () => {
        if (!confirm('¿Deseas sincronizar el inventario? (Se agregarán los ítems faltantes sin borrar revisiones)')) return;
        syncBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Sincronizando...';
        syncBtn.disabled = true;
        try {
            const batch = writeBatch(db);
            fullInventory.forEach((item) => {
                const docRef = doc(db, currentCollection, item.codigo);
                batch.set(docRef, {
                    codigo: item.codigo, sicafi: item.sicafi, pf: item.pf,
                    descripcion: item.descripcion, ubicacion: item.ubicacion,
                    marca: item.marca, modelo: item.modelo, serie: item.serie
                }, { merge: true });
            });
            await batch.commit();
            alert('¡Sincronización completada! La página se recargará.');
            window.location.reload();
        } catch (error) {
            console.error("Error syncing:", error);
            alert('Error al sincronizar. Revisa la consola.');
            syncBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Sincronizar';
            syncBtn.disabled = false;
        }
    });

    // Clear DB button
    const clearDbBtn = document.getElementById('clear-db-btn');
    if (clearDbBtn) {
        clearDbBtn.addEventListener('click', async () => {
            if (!confirm('¿Estás seguro de borrar TODOS los datos? Esto eliminará todas las revisiones y fotos guardadas.')) return;
            clearDbBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Borrando...';
            clearDbBtn.disabled = true;
            try {
                const snap = await getDocs(collection(db, currentCollection));
                const batch = writeBatch(db);
                snap.forEach((docSnap) => batch.delete(docSnap.ref));
                await batch.commit();
                alert('Base de datos borrada. La página se recargará.');
                window.location.reload();
            } catch (error) {
                console.error("Error clearing database:", error);
                alert('Error al borrar. Revisa la consola.');
                clearDbBtn.innerHTML = '<i class="ph ph-trash"></i> Borrar Todo';
                clearDbBtn.disabled = false;
            }
        });
    }

    // Add Item
    const addItemBtn = document.getElementById('add-item-btn');
    const addItemModal = document.getElementById('add-item-modal');
    const closeAddModal = document.querySelector('.close-add-modal');
    const addItemForm = document.getElementById('add-item-form');

    if (addItemBtn && addItemModal) {
        addItemBtn.addEventListener('click', () => addItemModal.classList.remove('hidden'));
        closeAddModal.addEventListener('click', () => addItemModal.classList.add('hidden'));
        addItemModal.addEventListener('click', (e) => { if (e.target === addItemModal) addItemModal.classList.add('hidden'); });

        addItemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = addItemForm.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
            submitBtn.disabled = true;

            const newItem = {
                codigo: document.getElementById('add-codigo').value.trim(),
                sicafi: document.getElementById('add-sicafi').value.trim(),
                pf: document.getElementById('add-pf').value.trim(),
                descripcion: document.getElementById('add-descripcion').value.trim(),
                ubicacion: document.getElementById('add-ubicacion').value.trim(),
                marca: document.getElementById('add-marca').value.trim(),
                modelo: document.getElementById('add-modelo').value.trim(),
                serie: document.getElementById('add-serie').value.trim(),
                estado: "", revisado: false, comentarios: "", fotoUrl: ""
            };

            try {
                const existingDoc = await getDocs(collection(db, currentCollection));
                let exists = false;
                existingDoc.forEach(d => { if (d.id === newItem.codigo) exists = true; });
                if (exists) {
                    alert('Ya existe un item con ese código.');
                    submitBtn.innerHTML = 'Guardar Item';
                    submitBtn.disabled = false;
                    return;
                }
                await setDoc(doc(db, currentCollection, newItem.codigo), newItem);
                alert('Item guardado correctamente. La página se recargará.');
                window.location.reload();
            } catch (error) {
                console.error("Error adding item:", error);
                alert('Error al guardar el item.');
                submitBtn.innerHTML = 'Guardar Item';
                submitBtn.disabled = false;
            }
        });
    }

    // Edit Item Modal
    const editItemModal = document.getElementById('edit-item-modal');
    const closeEditModal = document.querySelector('.close-edit-modal');
    const editItemForm = document.getElementById('edit-item-form');

    if (editItemModal) {
        closeEditModal.addEventListener('click', () => editItemModal.classList.add('hidden'));
        editItemModal.addEventListener('click', (e) => { if (e.target === editItemModal) editItemModal.classList.add('hidden'); });

        editItemForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = editItemForm.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Guardando...';
            submitBtn.disabled = true;

            const originalCodigo = document.getElementById('edit-original-codigo').value;
            const isChecked = document.getElementById('edit-revisado').checked;
            const updatedItem = {
                sicafi: document.getElementById('edit-sicafi').value.trim(),
                pf: document.getElementById('edit-pf').value.trim(),
                descripcion: document.getElementById('edit-descripcion').value.trim(),
                ubicacion: document.getElementById('edit-ubicacion').value.trim(),
                marca: document.getElementById('edit-marca').value.trim(),
                modelo: document.getElementById('edit-modelo').value.trim(),
                serie: document.getElementById('edit-serie').value.trim(),
                estado: document.getElementById('edit-estado').value,
                proximaRevision: document.getElementById('edit-proxima-revision').value,
                revisado: isChecked,
                comentarios: document.getElementById('edit-comentarios').value.trim()
            };

            const currentItem = currentInventoryData.find(i => i.codigo === originalCodigo);
            if (isChecked && currentItem && !currentItem.revisado) {
                const today = new Date().toISOString().split('T')[0];
                updatedItem.ultimaRevision = `${today} por ${inventariador}`;
            }

            try {
                await updateDoc(doc(db, currentCollection, originalCodigo), updatedItem);
                alert('Item actualizado correctamente. La página se recargará.');
                window.location.reload();
            } catch (error) {
                console.error("Error updating item:", error);
                alert('Error al actualizar el item.');
                submitBtn.innerHTML = 'Actualizar Item';
                submitBtn.disabled = false;
            }
        });
    }

    // Export PDF
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            if (typeof window.jspdf === 'undefined') {
                alert('La librería PDF no se ha cargado.');
                return;
            }
            exportPdfBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Generando PDF...';
            try {
                const { jsPDF } = window.jspdf;
                const pdfDoc = new jsPDF({ orientation: 'landscape' });
                pdfDoc.text(`Inventario ${currentUnit} - Cía. 51`, 14, 15);
                pdfDoc.setFontSize(10);

                const fetchImageAsBase64 = (url) => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.crossOrigin = 'Anonymous';
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = "#ffffff";
                            ctx.fillRect(0, 0, canvas.width, canvas.height);
                            ctx.drawImage(img, 0, 0);
                            try { resolve(canvas.toDataURL('image/jpeg', 0.8)); } catch (e) { resolve(null); }
                        };
                        img.onerror = () => {
                            const proxyImg = new Image();
                            proxyImg.crossOrigin = 'Anonymous';
                            proxyImg.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = proxyImg.width;
                                canvas.height = proxyImg.height;
                                const ctx = canvas.getContext('2d');
                                ctx.fillStyle = "#ffffff";
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(proxyImg, 0, 0);
                                try { resolve(canvas.toDataURL('image/jpeg', 0.8)); } catch (e) { resolve(null); }
                            };
                            proxyImg.onerror = () => resolve(null);
                            proxyImg.src = 'https://corsproxy.io/?' + encodeURIComponent(url);
                        };
                        img.src = url;
                    });
                };

                const pdfSnap = await getDocs(collection(db, currentCollection));
                const pdfData = [];
                let pdfIdx = 1;
                for (const docSnap of pdfSnap.docs) {
                    const item = docSnap.data();
                    let base64Img = '';
                    if (item.fotoUrl) base64Img = await fetchImageAsBase64(item.fotoUrl) || '';
                    pdfData.push([
                        base64Img, pdfIdx++,
                        item.codigo || '', item.sicafi || '', item.pf || '',
                        item.descripcion || '', item.ubicacion || '',
                        item.marca || '', item.modelo || '', item.serie || '',
                        item.estado || '', item.revisado ? 'Sí' : 'No', item.comentarios || ''
                    ]);
                }

                pdfDoc.autoTable({
                    startY: 20,
                    head: [['Foto', '#', 'Código', 'SICAFI', 'PF', 'Descripción', 'Ubicación', 'Marca', 'Modelo', 'Serie', 'Estado', 'Revisado', 'Comentarios']],
                    body: pdfData,
                    theme: 'grid',
                    styles: { fontSize: 7.5, minCellHeight: 35, valign: 'middle', halign: 'left', cellPadding: 1, overflow: 'linebreak' },
                    headStyles: { fillColor: [139, 0, 0], halign: 'center', fontSize: 7.5, fontStyle: 'bold' },
                    columnStyles: {
                        0: { cellWidth: 35 }, 1: { cellWidth: 10, halign: 'center' },
                        2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 18 },
                        4: { cellWidth: 15 }, 5: { cellWidth: 'auto' },
                        6: { cellWidth: 25 }, 7: { cellWidth: 18 },
                        8: { cellWidth: 18 }, 9: { cellWidth: 22 },
                        10: { cellWidth: 15, halign: 'center' }, 11: { cellWidth: 15, halign: 'center' },
                        12: { cellWidth: 25 }
                    },
                    didDrawCell: function (data) {
                        if (data.column.index === 0 && data.cell.section === 'body') {
                            const base64 = data.row.raw[0];
                            if (base64 && base64.startsWith('data:image')) {
                                const padding = 2;
                                const size = data.cell.width - (padding * 2);
                                pdfDoc.addImage(base64, 'JPEG', data.cell.x + padding, data.cell.y + padding, size, size);
                            }
                        }
                    },
                    didParseCell: function (data) {
                        if (data.column.index === 0 && data.cell.section === 'body') data.cell.text = '';
                    }
                });

                pdfDoc.save('inventario_5ta_brigada.pdf');
            } catch (err) {
                console.error("Error generating PDF:", err);
                alert('Error al generar PDF');
            } finally {
                exportPdfBtn.innerHTML = '<i class="ph ph-file-pdf"></i> PDF';
            }
        });
    }

    // Export Excel
    const exportExcelBtn = document.getElementById('export-excel-btn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', async () => {
            if (typeof XLSX === 'undefined') {
                alert('La librería Excel no se ha cargado.');
                return;
            }
            exportExcelBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Generando Excel...';
            try {
                const excelSnap = await getDocs(collection(db, currentCollection));
                let excelIdx = 1;
                const excelData = excelSnap.docs.map(docSnap => {
                    const item = docSnap.data();
                    return {
                        '#': excelIdx++,
                        'Código': item.codigo || '',
                        'SICAFI': item.sicafi || '',
                        'PF': item.pf || '',
                        'Descripción': item.descripcion || '',
                        'Ubicación': item.ubicacion || '',
                        'Marca': item.marca || '',
                        'Modelo': item.modelo || '',
                        'Serie': item.serie || '',
                        'Estado': item.estado || '',
                        'Revisado': item.revisado ? 'Sí' : 'No',
                        'Comentarios': item.comentarios || '',
                        'URL Foto': item.fotoUrl || ''
                    };
                });

                const worksheet = XLSX.utils.json_to_sheet(excelData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
                XLSX.writeFile(workbook, "inventario_5ta_brigada.xlsx");
            } catch (err) {
                console.error("Error generating Excel:", err);
                alert('Error al generar Excel');
            } finally {
                exportExcelBtn.innerHTML = '<i class="ph ph-file-xls"></i> Excel';
            }
        });
    }

    // --- Smart AI Assistant Logic ---
    const aiInput = document.getElementById('ai-input');
    const sendAi = document.getElementById('send-ai');
    const aiMessages = document.getElementById('ai-messages');

    if (aiInput && sendAi && aiMessages) {
        function addMessage(text, sender, actions = []) {
            const div = document.createElement('div');
            div.className = `ai-message ${sender}`;
            div.innerHTML = text;

            if (actions.length > 0) {
                const actionsDiv = document.createElement('div');
                actionsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;';
                actions.forEach(action => {
                    const btn = document.createElement('button');
                    btn.innerHTML = action.label;
                    btn.style.cssText = 'background:#6366f1;color:white;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:6px;';
                    btn.addEventListener('click', action.handler);
                    actionsDiv.appendChild(btn);
                });
                div.appendChild(actionsDiv);
            }

            if (aiMessages.style.maxHeight === '0px' || !aiMessages.style.maxHeight) {
                aiMessages.style.padding = '1.5rem';
                aiMessages.style.maxHeight = '500px';
                aiMessages.style.overflowY = 'auto';
            }
            aiMessages.appendChild(div);
            aiMessages.scrollTop = aiMessages.scrollHeight;
        }

        // Función para filtrar la tabla en pantalla
        function filterTableWith(term) {
            searchInput.value = term;
            searchInput.dispatchEvent(new Event('input'));
        }

        // Función para descargar PDF de un conjunto de ítems
        async function downloadFilteredPDF(items, titulo) {
            if (typeof window.jspdf === 'undefined') {
                addMessage("⚠️ La librería de PDF no está disponible.", 'assistant');
                return;
            }
            addMessage(`⏳ Generando PDF de <strong>${items.length}</strong> ítems de "${titulo}"...`, 'assistant');
            const { jsPDF } = window.jspdf;
            const pdfDoc = new jsPDF({ orientation: 'landscape' });
            pdfDoc.text(`Inventario ${currentUnit} — Filtro: "${titulo}"`, 14, 15);
            pdfDoc.setFontSize(9);
            const pdfData = items.map((item, idx) => [
                idx + 1,
                item.codigo || '', item.sicafi || '', item.pf || '',
                item.descripcion || '', item.ubicacion || '',
                item.marca || '', item.modelo || '', item.serie || '',
                item.estado || '', item.revisado ? 'Sí' : 'No', item.comentarios || ''
            ]);
            pdfDoc.autoTable({
                startY: 20,
                head: [['#', 'Código', 'SICAFI', 'PF', 'Descripción', 'Ubicación', 'Marca', 'Modelo', 'Serie', 'Estado', 'Revisado', 'Comentarios']],
                body: pdfData,
                theme: 'grid',
                styles: { fontSize: 7.5, valign: 'middle', halign: 'left', overflow: 'linebreak' },
                headStyles: { fillColor: [99, 102, 241], halign: 'center', fontSize: 7.5, fontStyle: 'bold' }
            });
            pdfDoc.save(`inventario_${titulo.replace(/\s+/g, '_')}.pdf`);
            addMessage(`✅ ¡PDF listo! Se han descargado <strong>${items.length}</strong> ítems de "${titulo}". 📄`, 'assistant');
        }

        // Función para descargar Excel de un conjunto de ítems
        function downloadFilteredExcel(items, titulo) {
            if (typeof XLSX === 'undefined') {
                addMessage("⚠️ La librería de Excel no está disponible.", 'assistant');
                return;
            }
            const excelData = items.map((item, idx) => ({
                '#': idx + 1,
                'Código': item.codigo || '', 'SICAFI': item.sicafi || '', 'PF': item.pf || '',
                'Descripción': item.descripcion || '', 'Ubicación': item.ubicacion || '',
                'Marca': item.marca || '', 'Modelo': item.modelo || '', 'Serie': item.serie || '',
                'Estado': item.estado || '', 'Revisado': item.revisado ? 'Sí' : 'No',
                'Comentarios': item.comentarios || ''
            }));
            const worksheet = XLSX.utils.json_to_sheet(excelData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Filtrado");
            XLSX.writeFile(workbook, `inventario_${titulo.replace(/\s+/g, '_')}.xlsx`);
            addMessage(`✅ ¡Excel listo!`, 'assistant');
        }

        let chatHistory = [];
        let lastMatchedItems = [];
        let lastKeywords = [];

        async function processAiQuery(query) {
            const typingDiv = document.createElement('div');
            typingDiv.className = 'ai-message assistant';
            typingDiv.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
            aiMessages.style.padding = '1.5rem';
            aiMessages.style.maxHeight = '800px';
            aiMessages.appendChild(typingDiv);
            aiMessages.scrollTop = aiMessages.scrollHeight;

            if (!currentInventoryData || currentInventoryData.length === 0) {
                typingDiv.remove();
                addMessage("⚠️ Los datos aún no han cargado.", 'assistant');
                return;
            }

            // ─── NORMALIZATION ───────────────────────────────────────────────
            function norm(str) {
                let s = (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (s.endsWith("es") && s.length > 4) s = s.slice(0, -2);
                else if (s.endsWith("s") && s.length > 3) s = s.slice(0, -1);
                return s;
            }

            const qNorm = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            // ─── FIREFIGHTER SYNONYM DICTIONARY ──────────────────────────────
            const SYNONYMS = {
                // ── Hose / Water ──────────────────────────────────────────────
                'tramo':['tramo'],'tramos':['tramo'],'manguera':['manguera','tramo'],
                'mangueras':['manguera','tramo'],'linea':['linea','tramo','manguera'],
                'lineas':['linea','tramo'],'hose':['tramo','manguera'],
                // Nozzles
                'piton':['piton'],'pitones':['piton'],'lanza':['piton','lanza'],
                'boquilla':['piton','boquilla'],'nozzle':['piton'],
                'pitón':['piton'],'pitónes':['piton'],
                // Adapters / fittings
                'reduccion':['reduccion','adaptador'],'adaptador':['adaptador','reduccion'],
                'siames':['siames'],'bifurcacion':['bifurcacion','siames'],
                'copl':['copl','acoplamiento'],'acoplamiento':['acoplamiento','copl'],
                'llave':['llave'],'espanero':['espanero','llave'],
                // ── Breathing / SCBA ─────────────────────────────────────────
                'scba':['equipo de respiracion','scba','msa','msn','respiracion'],
                'aire':['aire','equipo de respiracion','cilindro'],
                'cilindro':['cilindro','tanque'],'cilindros':['cilindro','tanque'],
                'tanque':['cilindro','tanque'],'tanques':['cilindro','tanque'],
                'oxigeno':['oxigeno','aire','cilindro'],'mascarilla':['mascarilla','mascara'],
                'mascara':['mascarilla','mascara'],'regulador':['regulador'],
                'arnés':['arnes','arnés'],'arnes':['arnes'],
                // ── Rescue Tools ─────────────────────────────────────────────
                'hacha':['hacha'],'hachas':['hacha'],'destral':['hacha','destral'],
                'palanca':['palanca','barreta'],'barreta':['barreta','palanca'],
                'cizalla':['cizalla'],'cizallas':['cizalla'],
                'excarcelador':['excarcelador','hidraulico'],'hidraulico':['hidraulico'],
                'pinza':['pinza','cizalla'],'cortador':['cizalla','cortador'],
                'separador':['separador','hidraulico'],'ram':['ram','hidraulico'],
                'combi':['combi','hidraulico'],'herramienta':['herramienta','hidraulico'],
                // ── Ladders ──────────────────────────────────────────────────
                'escalera':['escalera'],'escaleras':['escalera'],'escala':['escalera'],
                'escalas':['escalera'],'ladder':['escalera'],
                // ── PPE / Personal ────────────────────────────────────────────
                'casco':['casco'],'cascos':['casco'],'helmet':['casco'],
                'guante':['guante'],'guantes':['guante'],'glove':['guante'],
                'bota':['bota'],'botas':['bota'],'boot':['bota'],
                'chaqueton':['chaqueton','chaqueta'],'chaqueta':['chaqueton','chaqueta'],
                'abrigo':['chaqueton'],'pantalon':['pantalon'],'pantalones':['pantalon'],
                'capucha':['capucha'],'pasamontaña':['capucha','pasamontana'],
                'ropa':['chaqueton','pantalon'],'uniforme':['chaqueton','pantalon'],
                'epp':['casco','guante','bota','chaqueton'],
                // ── Electrical / Lights ───────────────────────────────────────
                'linterna':['linterna','lampara'],'linternas':['linterna','lampara'],
                'lampara':['lampara','linterna'],'luz':['linterna','lampara','reflector'],
                'generador':['generador'],'generadores':['generador'],
                'reflector':['reflector','lampara'],'reflectores':['reflector'],
                'cable':['cable'],'extension':['cable','extension'],
                // ── Vehicles / Motor ──────────────────────────────────────────
                'motosierra':['motosierra','sierra'],'sierra':['motosierra','sierra'],
                'motobomba':['motobomba','bomba'],'bomba':['motobomba','bomba'],
                'motor':['motor','motosierra','motobomba'],
                // ── Fire Extinguishers ────────────────────────────────────────
                'extintor':['extintor','extinguidor'],'extintores':['extintor','extinguidor'],
                'extinguidor':['extintor','extinguidor'],'extinguish':['extintor'],
                'co2':['co2','extintor'],'pqs':['pqs','extintor'],
                // ── Ropes / Heights ───────────────────────────────────────────
                'cuerda':['cuerda','linea de vida','soga'],'cuerdas':['cuerda','soga'],
                'soga':['soga','cuerda'],'sogas':['soga','cuerda'],
                'vida':['linea de vida','cuerda'],'rappel':['cuerda','descensor'],
                'descensor':['descensor','cuerda'],'ascensor':['ascensor'],
                'mosqueton':['mosqueton'],'arnes_alt':['arnes'],
                // ── Medical / EMS ─────────────────────────────────────────────
                'botiquin':['botiquin','primeros auxilios','kit'],
                'camilla':['camilla'],'camillas':['camilla'],
                'oximetro':['oximetro'],'desfibrilador':['desfibrilador','dea'],
                'dea':['dea','desfibrilador'],'collar':['collar','inmovilizador'],
                'inmovilizador':['inmovilizador','collar'],
                // ── Communication ─────────────────────────────────────────────
                'radio':['radio'],'radios':['radio'],
                'comunicacion':['radio','comunicacion'],'handie':['radio'],
                'walkie':['radio'],'driver':['driver','sirena'],
                'sirena':['sirena','driver'],'bocina':['sirena','bocina'],
                // ── Misc ─────────────────────────────────────────────────────
                'kit':['kit','bolsa','maletin'],'bolsa':['bolsa','kit'],
                'maletin':['maletin','kit'],'cono':['cono'],
                'triangulo':['triangulo','cono'],'señal':['señal','cono','triangulo'],
                'chaleco':['chaleco'],'chalecos':['chaleco'],
                'careta':['careta','mascara','escudo'],'escudo':['escudo','careta'],
                'visor':['visor','careta'],'foco':['linterna','foco'],
                'pico':['pico'],'pala':['pala'],'azadon':['azadon','pala','pico'],
                'soplete':['soplete'],'plasma':['plasma','cortador'],
            };

            function expandWithSynonyms(word) { return SYNONYMS[word] || [word]; }

            // ─── INTENT DETECTION ────────────────────────────────────────────
            const INTENTS = {
                download_pdf:   /\bpdf\b|descarg.*pdf|reporte|imprim|export.*pdf|genera.*pdf|baja.*pdf/.test(qNorm),
                download_excel: /\bexcel\b|\bxls\b|descarg.*excel|export.*excel|genera.*excel/.test(qNorm),
                show_table:     /\b(muestr|mostr|enseñ|tabla|ver\s+list|ver\s+todo|visualiz|ponm|filtrar|filtr)\b/.test(qNorm),
                classify:       /clasific|subcategor|subgenero|subtipo|tipo\s+de|tipos\s+de|tipos?\s+hay|cuales?\s+(son|tipo|hay|exist)|agrup|organiz|diferent|distint|variedad|variant|separa|desglos|listado\s+de|que\s+tipos|cuantos\s+tipos/.test(qNorm),
                analyze:        /analiz|compar|estadistic|resumen|informe|promedio|balance|resum|totale|cuadro/.test(qNorm),
                affirm:         /^(si[\s,!]|sí|claro|dale|por supuesto|ok|hazlo|adelante|positivo|correcto|exacto|afirmativo|bueno|listo|genera|procede)/.test(qNorm) || qNorm.trim() === 'si' || qNorm.trim() === 'sí',
                greet:          /^(hola|buenas|saludos|hey|buenos|hi\b|buen dia|buen tarde|buenas noches)/.test(qNorm),
                status:         /\b(estado|condicion|funciona|malo|bueno|daña|roto|bien|operativ|disponible|sirve|funcional)\b/.test(qNorm),
                location:       /\b(donde|ubicacion|estan|se encuentra|lugar|sitio|sector|guardado|almacena)\b/.test(qNorm),
            };

            // Affirmative after asking for report → trigger PDF
            if (INTENTS.affirm) {
                const lastAssistantMsg = [...chatHistory].reverse().find(m => m.role === 'assistant');
                if (lastAssistantMsg && lastAssistantMsg.content.includes("reporte")) {
                    INTENTS.download_pdf = true;
                }
            }

            // ─── KEYWORD EXTRACTION ───────────────────────────────────────────
            // PRE-PROCESSING: Strip common question prefixes to get the pure subject
            // e.g. "dame los tipos de tramo" → "tramo", "cuáles son los cascos" → "cascos"
            let cleanQuery = qNorm
                .replace(/^(dame|digame|dime|muestra|enseña|listame|necesito saber|quiero saber|quiero ver|quiero que me|que me digas|me puedes decir)\s+(los?|las?|un|una|el|la)?\s*/i, '')
                .replace(/\b(tipos?\s+de|clases?\s+de|tipos?\s+hay\s+de|que\s+tipos?\s+(hay|existen|tienen)?)\s*/gi, '')
                .replace(/\b(cuantos?\s+(tipos?|clases?|hay)\s+(de|en|con)?)\s*/gi, '')
                .replace(/\b(cuales?\s+son\s+(los?|las?)?)\s*/gi, '')
                .replace(/\b(que\s+(tipo|clase|modelo|marca)\s+(de|tienen)?)\s*/gi, '')
                .trim();

            const stopWordsNorm = new Set([
                // conversational filler
                'hola','saludo','si','no','clar','ok','gracia','porfa','favor','please','bueno','bien',
                // question/modifier words — CRITICAL: these describe HOW to ask, not WHAT to search
                'cuant','cuanta','cuanto','cuantos','cuantas','donde','hay','que','como','cual','cuales',
                'quien','cuando','porque','cuales','existe','existen','tienen','tienes',
                // TYPE/CLASS modifiers — these signal INTENT, not ITEM NAMES
                'tipo','tipos','tip','clase','clases','clas','modelo','modelos','categoria','categorias',
                'variedad','variedades','version','versiones','marca','marcas','subtipo','subtipos',
                // articles / prepositions
                'de','el','la','lo','le','los','las','un','una','al','del','en','por','para','con','sin',
                'a','y','o','ni','pero','entre','sobre','bajo','hasta','desde','hacia','segun',
                // action verbs and commands (intent handled separately)
                'clasific','clasifica','clasifical','agrup','agrupa','grupalo','organiz','analiz','compar',
                'diferenci','diferencia','mostr','muestr','mostram','muestra','lista','listar','ver','verl',
                'descarg','descarga','descargal','descargalo','descargala','genera','imprim','hazlo',
                'dame','dim','pon','quier','quiero','necesit','busco','buscam','busca',
                'enseñ','visualiz','export','filtr','filtram','separa',
                // misc fillers
                'total','cantidad','son','e','me','mi','tu','su','se','te','nos',
                'este','esta','estos','estas','ese','esa','aquel','aquella',
                'tengo','tien','tiene','tenemos','tienen','ali','aqui','alla','aca',
                'nada','todo','toda','todos','todas','sol','algo','alguno','alguna',
                'favor','porfavor','deme','digame','cuales','puedes','puede','podrias',
                'hay','haber','habia','seran','son','hay'
            ]);

            // Use pre-processed query for keyword extraction, original for intent context
            const rawWords = cleanQuery.split(/[\s¿?.,!;:"]+/).filter(w => w.length >= 2 || /^\d+$/.test(w));
            const baseKeywords = rawWords.map(norm).filter(w => w.length >= 1 && !stopWordsNorm.has(w));

            // Expand with synonyms for richer matching
            const keywords = [];
            const expandedSets = [];
            baseKeywords.forEach(kw => {
                const expanded = expandWithSynonyms(kw);
                expanded.forEach(e => { if (!keywords.includes(e)) keywords.push(e); });
                expandedSets.push(expanded);
            });


            console.log("Intent:", JSON.stringify(INTENTS), "| BaseKw:", baseKeywords, "| Expanded:", keywords);

            // ─── SEARCH ──────────────────────────────────────────────────────
            // For numeric keywords, use word-boundary regex so '2' ≠ inside '1/2'
            function kwMatches(text, kw) {
                if (/^[\d\/]+$/.test(kw)) {
                    return new RegExp(`(^|[^\\d\/])${kw.replace(/\//g,'\\/')}([^\\d\/]|$)`).test(text);
                }
                return text.includes(kw);
            }

            let matchedItems = [];

            // NOTE: Analytical queries (classify/analyze) ALSO search — they search first, then analyze results.
            if (baseKeywords.length > 0) {
                // Strategy 1: AND across all expanded keyword groups (most precise)
                matchedItems = currentInventoryData.filter(item => {
                    const desc = norm(item.descripcion);
                    const cod  = norm(item.codigo);
                    const loc  = norm(item.ubicacion);
                    // Each original keyword must match (using any of its synonyms)
                    return expandedSets.every(group =>
                        group.some(kw => kwMatches(desc, kw) || kwMatches(cod, kw) || kwMatches(loc, kw))
                    );
                });

                // Strategy 2: OR fallback using first keyword if AND returns nothing
                if (matchedItems.length === 0 && baseKeywords.length > 0) {
                    const firstExpanded = expandWithSynonyms(baseKeywords[0]);
                    matchedItems = currentInventoryData.filter(item => {
                        const desc = norm(item.descripcion);
                        const cod  = norm(item.codigo);
                        const loc  = norm(item.ubicacion);
                        return firstExpanded.some(kw => kwMatches(desc, kw) || kwMatches(cod, kw) || kwMatches(loc, kw));
                    });
                    console.log("OR-fallback search used.");
                }

                if (matchedItems.length > 0) {
                    lastMatchedItems = matchedItems;
                    lastKeywords = baseKeywords;
                }
            }

            // ─── CONTEXT RETENTION ENGINE ─────────────────────────────────────
            const needsContext = matchedItems.length === 0 && lastMatchedItems.length > 0;
            if (needsContext) {
                const queryMentionsPrevTopic = lastKeywords.some(kw => qNorm.includes(kw));
                const isFollowUp = INTENTS.classify || INTENTS.analyze || INTENTS.download_pdf ||
                    INTENTS.download_excel || INTENTS.show_table || INTENTS.affirm ||
                    INTENTS.status || INTENTS.location ||
                    queryMentionsPrevTopic || query.trim().length < 12;
                if (isFollowUp) {
                    matchedItems = lastMatchedItems;
                    console.log("Context Retention: using previous results.");
                }
            }

            // ─── FACTS GENERATION ─────────────────────────────────────────────
            const isAnalyticalQuery = INTENTS.classify || INTENTS.analyze;
            const kwStr      = baseKeywords.length > 0 ? baseKeywords.join(' ') : lastKeywords.join(' ');
            const filterTerm = kwStr.split(' ')[0] || '';
            let factsText = "";
            if (matchedItems.length > 0) {
                const locs   = [...new Set(matchedItems.map(i => i.ubicacion || 'Sin ubicación'))];
                const buenos = matchedItems.filter(i => (i.estado || '').toLowerCase().includes('bueno')).length;
                factsText = `Hay ${matchedItems.length} ítems de "${kwStr}". Ubicaciones: ${locs.join(', ')}. Condición: ${buenos} en buen estado, ${matchedItems.length - buenos} sin especificar.`;
                if (matchedItems.length <= 20) {
                    const detalles = matchedItems.map(i =>
                        `• [${i.codigo}] ${i.descripcion} — Marca: ${i.marca || 'N/A'}, Estado: ${i.estado || 'N/A'}`
                    ).join('\n');
                    factsText += `\nDETALLES POR ÍTEM:\n${detalles}`;
                }
            }

            // ─── LOCAL INTELLIGENCE ENGINE ────────────────────────────────────
            function buildLocalResponse(items, intent, kwStr, query) {
                if (items.length === 0) {
                    if (intent.greet) {
                        const cats = [...new Set(currentInventoryData.map(i => (i.descripcion||'').split(' ')[0]))].slice(0,8).join(', ');
                        return `¡Hola ${inventariador || 'Bombero'}! 👋 Soy el Cerebro Logístico U-51.\n\nPuedo ayudarte con:\n  🔍 Búsquedas: "cuántos pitones hay", "busca escaleras"\n  📊 Análisis: "clasifica los tramos", "analiza el inventario"\n  📄 Reportes: "descarga el PDF", "exportar Excel"\n  🗺️ Ubicaciones: "dónde están los cascos"\n\nEquipos disponibles en esta unidad: ${cats}... ¿Qué necesitas? 🚒`;
                    }
                    return null;
                }

                const locs   = [...new Set(items.map(i => i.ubicacion || 'Sin ubicación'))];
                const buenos = items.filter(i => (i.estado||'').toLowerCase().includes('bueno')).length;
                const malos  = items.filter(i => (i.estado||'').toLowerCase().includes('malo')).length;
                const marcas = [...new Set(items.map(i => i.marca || 'N/A'))];

                // Group by exact description (used in multiple paths)
                const byDesc = {};
                items.forEach(i => { byDesc[i.descripcion] = (byDesc[i.descripcion]||0)+1; });
                const uniqueTypes = Object.keys(byDesc).length;

                // ── CLASSIFY: Group by brand/type ─────────────────────────────
                if (intent.classify) {
                    const byMarca = {};
                    items.forEach(i => {
                        const m = i.marca || 'Sin marca';
                        if (!byMarca[m]) byMarca[m] = [];
                        byMarca[m].push(i.descripcion);
                    });
                    let resp = `📊 Clasificación de los ${items.length} ítems de "${kwStr}":\n\n`;
                    Object.entries(byMarca).forEach(([marca, descs]) => {
                        // Group identical descriptions
                        const counts = {};
                        descs.forEach(d => { counts[d] = (counts[d]||0)+1; });
                        const lines = Object.entries(counts).map(([d,n]) => `  • ${n}x ${d}`).join('\n');
                        resp += `🔹 Marca ${marca} (${descs.length} unidades):\n${lines}\n\n`;
                    });
                    resp += `📍 Todos en: ${locs.join(', ')} ⚙️`;
                    return resp;
                }

                // ── ANALYZE: Statistics ───────────────────────────────────────
                if (intent.analyze) {
                    let resp = `📈 Análisis de "${kwStr}" — ${items.length} ítems totales:\n`;
                    resp += `  ✅ En buen estado: ${buenos}\n`;
                    resp += `  ⚠️ Mal estado: ${malos}\n`;
                    resp += `  ❓ Sin especificar: ${items.length - buenos - malos}\n`;
                    resp += `  🏷️ Marcas: ${marcas.join(', ')}\n`;
                    resp += `  📍 Ubicación: ${locs.join(', ')}`;
                    return resp;
                }

                // ── LOCATION query ────────────────────────────────────────────
                if (/donde|ubicacion|estan/.test(query.toLowerCase())) {
                    return `📍 Los ${items.length} ítems de "${kwStr}" están en: **${locs.join(', ')}**. Marcas presentes: ${marcas.join(', ')}. 🚒`;
                }

                // ── DEFAULT: Sub-genre grouping ───────────────────────────────
                // byDesc and uniqueTypes are already computed above

                if (uniqueTypes === 1) {
                    // All same type — simple answer
                    const [desc, count] = Object.entries(byDesc)[0];
                    return `🚒 Hay **${count} unidades** de ${desc}. Ubicación: ${locs.join(', ')}. Marcas: ${marcas.join(', ')}.`;
                }

                // Multiple sub-types → show breakdown
                let resp = `🚒 Encontré **${items.length} ítems** de "${kwStr}" en ${locs.join(', ')} — divididos en ${uniqueTypes} subtipos:\n\n`;
                Object.entries(byDesc)
                    .sort((a, b) => b[1] - a[1])
                    .forEach(([desc, count]) => {
                        resp += `  🔹 ${count}x ${desc}\n`;
                    });
                resp += `\n🏷️ Marcas: ${marcas.join(', ')}. Estado: ${buenos} buenos, ${malos} mal estado, ${items.length-buenos-malos} sin especificar.`;
                return resp;
            }

            // ─── AI CONVERSATIONAL BRAIN ──────────────────────────────────────
            try {
                // STEP 1: Generate smart local response first
                const localResponse = buildLocalResponse(matchedItems, INTENTS, kwStr, query);

                const inventorySummary = `Inventario ${currentUnit}: ${currentInventoryData.length} ítems totales. Inventariador: ${inventariador || 'Bombero'}.`;
                const dataContext      = factsText || (lastMatchedItems.length > 0
                    ? `Contexto previo: ${lastMatchedItems.length} ítems de "${lastKeywords.join(' ')}".`
                    : "Sin contexto de búsqueda activo.");
                const intentContext    = Object.entries(INTENTS).filter(([,v]) => v).map(([k]) => k).join(', ') || 'conversación general';

                const systemPrompt = `Eres "Cerebro Logístico U-51", una IA avanzada de inventario para Bomberos.
INVENTARIO: ${inventorySummary}
DATOS ACTUALES: ${dataContext}
INTENCIÓN DEL USUARIO: ${intentContext}

INSTRUCCIONES ABSOLUTAS:
1. Si la intención es "classify" o "analyze": Agrupa y analiza los DETALLES POR ÍTEM. Da un resumen inteligente por marca/tipo.
2. Si la intención incluye "download_pdf" o "download_excel": Confirma que el archivo fue generado automáticamente.
3. NUNCA muestres los datos en formato crudo. Conviértelos en lenguaje natural analítico.
4. Tono: IA avanzada, profesional, proactivo. Emojis precisos (🚒⚙️📊).
5. Responde en español. Conciso pero rico en información.`;

                chatHistory.push({ role: 'user', content: query });
                if (chatHistory.length > 20) chatHistory.shift();

                // STEP 2: Try to enhance with cloud AI (with short timeout)
                let finalText = localResponse;
                try {
                    const controller = new AbortController();
                    const timeoutId  = setTimeout(() => controller.abort(), 8000);

                    const response = await fetch('https://text.pollinations.ai/', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            messages: [
                                { role: 'system', content: systemPrompt },
                                ...chatHistory
                            ],
                            model: 'openai'
                        }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const rawText   = await response.text();
                        const cloudText = rawText.replace(/⚠️[\s\S]*?normally\./gi, '').trim();
                        // Only use cloud response if it's actually meaningful
                        if (cloudText && cloudText.length > 20 && !cloudText.toLowerCase().includes('no tengo información')) {
                            finalText = cloudText;
                        }
                    }
                } catch (_) {
                    // Cloud failed silently — local response is used
                    console.log("Cloud AI unavailable — using local intelligence.");
                }

                // STEP 3: Final safety net
                if (!finalText) {
                    finalText = matchedItems.length === 0
                        ? "🔍 No encontré ítems con ese criterio. Prueba con otro término (ej: 'manguera', 'hacha', 'piton')."
                        : `📋 ${matchedItems.length} ítems encontrados de "${kwStr}" en ${[...new Set(matchedItems.map(i=>i.ubicacion))].join(', ')}.`;
                }

                typingDiv.remove();
                chatHistory.push({ role: 'assistant', content: finalText });

                // Proactive actions (execute automatically)
                if (matchedItems.length > 0) {
                    if (INTENTS.download_pdf) await downloadFilteredPDF(matchedItems, kwStr || 'inventario');
                    if (INTENTS.download_excel) downloadFilteredExcel(matchedItems, kwStr || 'inventario');
                    if (INTENTS.show_table) filterTableWith(filterTerm);
                }

                const actions = matchedItems.length > 0 ? [
                    { label: '📋 Ver en Tabla', handler: () => filterTableWith(filterTerm) },
                    { label: '📄 PDF',          handler: () => downloadFilteredPDF(matchedItems, kwStr) },
                    { label: '📊 Excel',         handler: () => downloadFilteredExcel(matchedItems, kwStr) }
                ] : [
                    { label: '🔄 Ver Todo', handler: () => filterTableWith('') }
                ];

                addMessage(finalText.replace(/\n/g, '<br>'), 'assistant', actions);

            } catch (err) {
                console.error("AI Error:", err);
                typingDiv.remove();
                const msg = factsText
                    ? `🚨 Núcleo de lenguaje con latencia. Datos recuperados: ${factsText}`
                    : "🚒 Error de conexión. Intenta con una búsqueda directa.";
                addMessage(msg, 'assistant');
            }
        }



        sendAi.addEventListener('click', () => {
            const text = aiInput.value.trim();
            if (!text) return;
            addMessage(text, 'user');
            aiInput.value = '';
            processAiQuery(text);
        });

        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendAi.click();
        });
    }

}); // End of DOMContentLoaded
