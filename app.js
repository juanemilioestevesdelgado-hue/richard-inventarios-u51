import { fullInventory } from './data.js?v=2';

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

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBpGkDT1Fz-XqY_H7clwtHYiwyeCsWvrQk",
  authDomain: "inventario-5ta-brigada.firebaseapp.com",
  projectId: "inventario-5ta-brigada",
  storageBucket: "inventario-5ta-brigada.firebasestorage.app",
  messagingSenderId: "903523003246",
  appId: "1:903523003246:web:bd4cbd336d7f01ac46ef7f",
  measurementId: "G-LFWZTZFGRR"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
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

    tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center;">Cargando inventario desde Firebase...</td></tr>';

    // Real-time listener
    onSnapshot(collection(db, "inventory"), (snapshot) => {
        if (snapshot.empty) {
            console.log("Database is empty. Populating...");
            tableBody.innerHTML = '<tr><td colspan="15" style="text-align: center;">Inicializando base de datos por primera vez...</td></tr>';
            // One-time populate if empty
            const batch = writeBatch(db);
            fullInventory.forEach((item) => {
                const docRef = doc(db, "inventory", item.codigo);
                batch.set(docRef, { ...item, estado: "", revisado: false, comentarios: "", fotoUrl: "" });
            });
            batch.commit();
            return;
        }

        const inventoryData = [];
        snapshot.forEach((docSnap) => {
            inventoryData.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Sort data by codigo to keep numbering stable
        inventoryData.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, {numeric: true, sensitivity: 'base'}));

        totalItemsEl.textContent = inventoryData.length;
        reviewedCount = inventoryData.filter(item => item.revisado).length;
        reviewedItemsEl.textContent = reviewedCount;
        
        // Save current focus to restore it later
        const activeElementId = document.activeElement ? document.activeElement.id : null;
        const cursorPosition = document.activeElement ? document.activeElement.selectionStart : null;

        renderTable(inventoryData, tableBody, totalItemsEl, reviewedItemsEl, modal, modalImg);

        // Restore focus if it was a comment or status
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
                    <select class="status-select default" id="status-${item.id}">
                        <option value="" disabled ${!item.estado ? 'selected' : ''}>Seleccionar...</option>
                        <option value="bueno" ${item.estado === 'bueno' ? 'selected' : ''}>Bueno</option>
                        <option value="malo" ${item.estado === 'malo' ? 'selected' : ''}>Malo</option>
                        <option value="regular" ${item.estado === 'regular' ? 'selected' : ''}>Regular</option>
                        <option value="no-existe" ${item.estado === 'no-existe' ? 'selected' : ''}>No existe</option>
                    </select>
                </td>
                <td data-label="Revisión" class="action-column">
                    <div class="checkbox-wrapper">
                        <input type="checkbox" class="custom-checkbox" id="check-${item.id}" ${item.revisado ? 'checked' : ''}>
                    </div>
                </td>
                <td data-label="Comentarios" class="action-column">
                    <textarea class="comment-input" id="comment-${item.id}" rows="1" placeholder="Agregar comentario...">${item.comentarios || ''}</textarea>
                </td>
                <td data-label="Acciones" class="action-column" style="display:flex; gap:15px; align-items:center; justify-content:center; padding-top:10px;">
                    <button class="icon-btn edit-item-btn" id="edit-${item.id}" title="Editar Item" style="color: #3b82f6; background: none; border: none; cursor: pointer; font-size: 22px;"><i class="ph ph-pencil-simple"></i></button>
                    <button class="icon-btn delete-item-btn" id="delete-item-${item.id}" title="Borrar Item" style="color: #ef4444; background: none; border: none; cursor: pointer; font-size: 22px;"><i class="ph ph-trash"></i></button>
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
                if (isChecked) { tr.classList.add('completed'); reviewedCount++; }
                else { tr.classList.remove('completed'); reviewedCount--; }
                reviewedItemsEl.textContent = reviewedCount;
                await updateDoc(doc(db, "inventory", item.id), { revisado: isChecked });
            });

            // Comment
            const commentInput = tr.querySelector(`#comment-${item.id}`);
            let timeoutId;
            commentInput.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';
                clearTimeout(timeoutId);
                timeoutId = setTimeout(async () => {
                    await updateDoc(doc(db, "inventory", item.id), { comentarios: e.target.value });
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
                await updateDoc(doc(db, "inventory", item.id), { estado: e.target.value });
            });

            // Delete Item
            const deleteItemBtn = tr.querySelector(`#delete-item-${item.id}`);
            if (deleteItemBtn) {
                deleteItemBtn.addEventListener('click', async () => {
                    if (!confirm(`¿Estás seguro de ELIMINAR el ítem ${item.codigo}? Esta acción no se puede deshacer.`)) return;
                    try {
                        const batch = writeBatch(db);
                        batch.delete(doc(db, "inventory", item.id));
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
                        await updateDoc(doc(db, "inventory", item.id), { fotoUrl: "" });
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
                        await updateDoc(doc(db, "inventory", item.id), { fotoUrl: imageUrl });
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

    // Sync button
    const syncBtn = document.getElementById('sync-btn');
    syncBtn.addEventListener('click', async () => {
        if (!confirm('¿Deseas sincronizar el inventario? (Se agregarán los ítems faltantes sin borrar revisiones)')) return;
        syncBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Sincronizando...';
        syncBtn.disabled = true;
        try {
            const batch = writeBatch(db);
            fullInventory.forEach((item) => {
                const docRef = doc(db, "inventory", item.codigo);
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
                const snap = await getDocs(collection(db, "inventory"));
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
                const existingDoc = await getDocs(collection(db, "inventory"));
                let exists = false;
                existingDoc.forEach(d => { if (d.id === newItem.codigo) exists = true; });
                if (exists) {
                    alert('Ya existe un item con ese código.');
                    submitBtn.innerHTML = 'Guardar Item';
                    submitBtn.disabled = false;
                    return;
                }
                await setDoc(doc(db, "inventory", newItem.codigo), newItem);
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
            const updatedItem = {
                sicafi: document.getElementById('edit-sicafi').value.trim(),
                pf: document.getElementById('edit-pf').value.trim(),
                descripcion: document.getElementById('edit-descripcion').value.trim(),
                ubicacion: document.getElementById('edit-ubicacion').value.trim(),
                marca: document.getElementById('edit-marca').value.trim(),
                modelo: document.getElementById('edit-modelo').value.trim(),
                serie: document.getElementById('edit-serie').value.trim(),
                estado: document.getElementById('edit-estado').value,
                revisado: document.getElementById('edit-revisado').checked,
                comentarios: document.getElementById('edit-comentarios').value.trim()
            };

            try {
                await updateDoc(doc(db, "inventory", originalCodigo), updatedItem);
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
                pdfDoc.text("Inventario 5ta Brigada U-30", 14, 15);
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

                const pdfSnap = await getDocs(collection(db, "inventory"));
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
                    didDrawCell: function(data) {
                        if (data.column.index === 0 && data.cell.section === 'body') {
                            const base64 = data.row.raw[0];
                            if (base64 && base64.startsWith('data:image')) {
                                const padding = 2;
                                const size = data.cell.width - (padding * 2);
                                pdfDoc.addImage(base64, 'JPEG', data.cell.x + padding, data.cell.y + padding, size, size);
                            }
                        }
                    },
                    didParseCell: function(data) {
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
                const excelSnap = await getDocs(collection(db, "inventory"));
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

}); // End of DOMContentLoaded
