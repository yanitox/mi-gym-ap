// --- BASE DE DATOS LOCAL ---
// Usamos window.db para que coincida exactamente con lo que configuraste en el HTML
window.db = JSON.parse(localStorage.getItem('gym_vFinal_db')) || { 
    rutinas: [], 
    medidas: [], 
    historial: [] 
};

let sesionActiva = null;
let chartPeso = null, chartRendimiento = null, chartCardio = null;

// --- FUNCIÓN PARA GUARDAR (SINCRONIZADA CON NUBE) ---
function save() {
    // 1. Guardar en el navegador (local)
    localStorage.setItem('gym_vFinal_db', JSON.stringify(window.db));
    
    // 2. Sincronizar con Firebase (nube)
    // Usamos las variables que definiste en el script del index.html
    if (window.cloud_db && window.cloud_set) {
        window.cloud_set(window.cloud_ref(window.cloud_db, 'mi_usuario_gym'), window.db)
        .then(() => console.log("Sincronizado con la nube con éxito"))
        .catch((error) => console.error("Error al sincronizar:", error));
    }
    
    renderHome();
}

// --- NAVEGACIÓN ---
function mostrarVista(v, el) {
    document.querySelectorAll('.view').forEach(x => x.style.display = 'none');
    document.getElementById(`view-${v}`).style.display = 'block';
    
    if(el) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
    }
    
    if(v === 'profile') { 
        updatePesoChart(); 
        updateChartRendimiento(); 
        updateCardioChart();
    }
}

// --- GESTIÓN DE RUTINAS ---
function abrirModalCrear() {
    const nombre = prompt("Nombre de la rutina:");
    const ejStr = prompt("Ejercicios y Series (ej: Press Banca-3, Cruce Poleas-4):");
    
    if(!nombre || !ejStr) return;
    
    const ejercicios = ejStr.split(',').map(s => {
        const parts = s.split('-');
        return { nome: parts[0].trim(), defaultSeries: parseInt(parts[1]) || 3 };
    });
    
    window.db.rutinas.push({ nombre, ejercicios });
    save();
}

// Renderizar la pantalla de inicio
window.renderHome = function() {
    const listDiv = document.getElementById('lista-rutinas');
    if (!listDiv) return;

    listDiv.innerHTML = window.db.rutinas.map((r, i) => `
        <div class="card" onclick="verDetalleRutina(${i})">
            <h3>${r.nombre}</h3>
            <p style="color:gray; font-size:12px">${r.ejercicios.length} ejercicios</p>
        </div>
    `).join('');

    const histDiv = document.getElementById('historial-entrenos');
    if (histDiv) {
        histDiv.innerHTML = (window.db.historial || []).slice(-5).reverse().map((h, i) => {
            const originalIndex = window.db.historial.length - 1 - i;
            return `
                <div class="card" onclick="verDetalleHistorial(${originalIndex})">
                    <strong>${h.fecha}</strong> - ${h.nombre}
                </div>
            `;
        }).join('');
    }

    const select = document.getElementById('select-ejercicio-grafica');
    if (select) {
        const todosEjs = [...new Set((window.db.historial || []).flatMap(h => h.ejercicios.map(e => e.nome)))];
        select.innerHTML = todosEjs.map(e => `<option value="${e}">${e}</option>`).join('');
    }
}

// --- MODO ENTRENAMIENTO ---
function startWork(idx) {
    const r = window.db.rutinas[idx];
    sesionActiva = { nombre: r.nombre, fecha: new Date().toLocaleDateString() };
    
    document.getElementById('nombre-entreno-actual').innerText = r.nombre;
    const cont = document.getElementById('ejercicios-en-vivo');
    
    cont.innerHTML = r.ejercicios.map((ej, i) => `
        <div class="card" id="ej-${i}">
            <h3 style="color:var(--accent); margin-bottom:10px">${ej.nome}</h3>
            <textarea placeholder="Notas del ejercicio..."></textarea>
            <table class="train-table">
                <thead><tr><th>Serie</th><th>KG</th><th>Reps</th><th>✓</th><th></th></tr></thead>
                <tbody id="tb-${i}">
                    ${Array.from({length: ej.defaultSeries}, (_, s) => createRow(s+1)).join('')}
                </tbody>
            </table>
            <div style="display:flex; gap:10px">
                <button onclick="addRow(${i},'N')" class="btn-main" style="background:#222; margin:0; padding:10px; font-size:12px">+ Serie</button>
                <button onclick="addRow(${i},'D')" class="btn-main" style="background:orange; color:black; margin:0; padding:10px; font-size:12px">Drop</button>
            </div>
        </div>
    `).join('');
    
    mostrarVista('train');
}

function createRow(n, t='N') {
    return `<tr class="row-style">
        <td style="color:${t=='D'?'orange':'white'}; font-weight:bold">${t=='D'?'D':n}</td>
        <td><input type="number" class="k" value="0"></td>
        <td><input type="number" class="r" value="0"></td>
        <td><button class="check-btn" onclick="this.classList.toggle('active')">✓</button></td>
        <td><button onclick="this.parentElement.parentElement.remove()" style="background:none; border:none; color:#444">✕</button></td>
    </tr>`;
}

function addRow(i, t) { 
    document.getElementById(`tb-${i}`).insertAdjacentHTML('beforeend', createRow(0, t)); 
}

// CORRECCIÓN: Función de Finalizar Entrenamiento con manejo de errores
function finalizarEntreno() {
    if(!confirm("¿Finalizar y guardar entrenamiento?")) return;
    
    try {
        const ejs = [];
        document.querySelectorAll('[id^="ej-"]').forEach(el => {
            const series = [];
            el.querySelectorAll('tbody tr').forEach(tr => {
                series.push({ 
                    n: tr.cells[0].innerText, 
                    kg: parseFloat(tr.querySelector('.k').value) || 0, 
                    reps: parseInt(tr.querySelector('.r').value) || 0 
                });
            });
            ejs.push({ 
                nome: el.querySelector('h3').innerText, 
                nota: el.querySelector('textarea').value, 
                series 
            });
        });

        if (!window.db.historial) window.db.historial = [];

        window.db.historial.push({ 
            ...sesionActiva, 
            ejercicios: ejs, 
            cardio: { 
                min: parseFloat(document.getElementById('cardio-min').value) || 0, 
                kcal: parseFloat(document.getElementById('cardio-kcal').value) || 0 
            } 
        });
        
        save();
        mostrarVista('home');
    } catch (e) {
        console.error("Error al finalizar:", e);
        alert("Hubo un error al guardar. Revisa que todos los campos tengan números válidos.");
    }
}

// --- GRÁFICAS (USANDO window.db) ---
function updatePesoChart() {
    const ctx = document.getElementById('graficaPeso').getContext('2d');
    if(chartPeso) chartPeso.destroy();
    const medidas = window.db.medidas || [];
    chartPeso = new Chart(ctx, { 
        type: 'line', 
        data: { 
            labels: medidas.map(m => m.fecha).reverse(), 
            datasets: [{ 
                label: 'Peso Corporal (kg)', 
                data: medidas.map(m => m.valor).reverse(), 
                borderColor: '#0A84FF', 
                backgroundColor: 'rgba(10, 132, 255, 0.1)',
                fill: true,
                tension: 0.3 
            }] 
        },
        options: { plugins: { legend: { display: false } } }
    });
}

function updateCardioChart() {
    const ctx = document.getElementById('graficaCardio').getContext('2d');
    if(chartCardio) chartCardio.destroy();
    const dataH = (window.db.historial || []).filter(h => h.cardio && (h.cardio.min > 0 || h.cardio.kcal > 0)).slice(-7);
    chartCardio = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dataH.map(h => h.fecha),
            datasets: [
                { label: 'Calorías', data: dataH.map(h => h.cardio.kcal), backgroundColor: '#FF2D55', order: 2 },
                { label: 'Minutos', data: dataH.map(h => h.cardio.min), borderColor: '#FFF', borderWidth: 2, type: 'line', order: 1, tension: 0.3 }
            ]
        },
        options: { plugins: { legend: { labels: { color: '#8e8e93', font: { size: 10 } } } } }
    });
}

function updateChartRendimiento() {
    const select = document.getElementById('select-ejercicio-grafica');
    if (!select) return;
    const ejNome = select.value;
    if(!ejNome) return;
    
    const filtrados = (window.db.historial || []).filter(h => h.ejercicios.some(e => e.nome === ejNome));
    const datos = filtrados.map(h => ({
        f: h.fecha,
        v: Math.max(...h.ejercicios.find(e => e.nome === ejNome).series.map(s => s.kg))
    }));

    const ctx = document.getElementById('graficaRendimiento').getContext('2d');
    if(chartRendimiento) chartRendimiento.destroy();
    chartRendimiento = new Chart(ctx, { 
        type: 'bar', 
        data: { labels: datos.map(d => d.f), datasets: [{ label: 'Kg Máximo', data: datos.map(d => d.v), backgroundColor: '#30D158' }] },
        options: { plugins: { legend: { display: false } } }
    });
}

// --- MODAL Y DETALLES ---
function verDetalleRutina(idx) {
    const r = window.db.rutinas[idx];
    let html = `<h2>${r.nombre}</h2><ul style="color:#8e8e93; margin-bottom:20px; text-align:left;">` + 
            r.ejercicios.map(e => `<li>${e.nome} (${e.defaultSeries} series)</li>`).join('') + `</ul>`;
    html += `<button class="btn-main" onclick="cerrarModal(); startWork(${idx})">Empezar Entrenamiento</button>`;
    html += `<button class="btn-edit" onclick="prepararEdicion(${idx})">📝 Editar Rutina</button>`;
    html += `<button class="btn-main" style="background:#444; margin-top:8px" onclick="borrarRutina(${idx})">Eliminar Rutina</button>`;
    document.getElementById('contenido-modal').innerHTML = html;
    document.getElementById('modal-detalles').style.display = 'block';
}

function verDetalleHistorial(idx) {
    const h = window.db.historial[idx];
    let html = `<h2>${h.nombre}</h2><small>${h.fecha}</small><hr style="border:0.5px solid #333; margin:15px 0">`;
    h.ejercicios.forEach(e => {
        html += `<h4>${e.nome}</h4><table style="width:100%; font-size:13px; margin-bottom:10px">` + 
                e.series.map(s => `<tr><td style="color:gray">Serie ${s.n}</td><td>${s.kg}kg</td><td>${s.reps} reps</td></tr>`).join('') + 
                `</table><p style="font-size:11px; color:gray; margin-bottom:15px">${e.nota || ''}</p>`;
    });
    if(h.cardio) html += `<div class="cardio-box" style="background:#222; padding:10px; border-radius:10px;">🏃 Cardio: ${h.cardio.min}m | ${h.cardio.kcal}kcal</div>`;
    document.getElementById('contenido-modal').innerHTML = html;
    document.getElementById('modal-detalles').style.display = 'block';
}

function prepararEdicion(idx) {
    const r = window.db.rutinas[idx];
    const ejString = r.ejercicios.map(e => `${e.nome}-${e.defaultSeries}`).join(', ');
    const nuevoNombre = prompt("Editar nombre:", r.nombre);
    const nuevoEjStr = prompt("Editar ejercicios:", ejString);
    if (nuevoNombre && nuevoEjStr) {
        const nuevosEjercicios = nuevoEjStr.split(',').map(s => {
            const parts = s.split('-');
            return { nome: parts[0].trim(), defaultSeries: parseInt(parts[1]) || 3 };
        });
        window.db.rutinas[idx] = { nombre: nuevoNombre, ejercicios: nuevosEjercicios };
        save(); cerrarModal();
    }
}

function registrarPesoCorporal() {
    const p = prompt("Tu peso hoy (kg):");
    if(p) { 
        if(!window.db.medidas) window.db.medidas = [];
        window.db.medidas.unshift({ fecha: new Date().toLocaleDateString(), valor: parseFloat(p) }); 
        save(); 
    }
}

function cerrarModal() { document.getElementById('modal-detalles').style.display = 'none'; }
function confirmarSalida() { if(confirm("¿Salir?")) mostrarVista('home'); }
function borrarRutina(idx) { if(confirm("¿Borrar?")) { window.db.rutinas.splice(idx, 1); save(); cerrarModal(); } }

// Inicialización
window.renderHome();