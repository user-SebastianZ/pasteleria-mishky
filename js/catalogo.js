// =============================================================
// Pastelería Mishky · Catálogo dinámico (versión con retos)
// =============================================================
const RUTA_DATOS = "data/productos.json";
const TODAS = "Todas";
const EXT_VALIDAS = /\.(jpe?g|png|webp|avif|gif)$/i;
const NUM_FANTASMAS = 8;

// --- Referencias al DOM ---------------------------------------
const contFiltros = document.querySelector("#filtros");
const controles = document.querySelector("#controles");
const buscador = document.querySelector("#buscador");
const selOrden = document.querySelector("#orden");
const chkDisponibles = document.querySelector("#solo-disponibles");
const grilla = document.querySelector("#grilla");
const estado = document.querySelector("#estado");
const aviso = document.querySelector("#aviso");
const plantilla = document.querySelector("#tpl-producto");
const dialogo = document.querySelector("#detalle");

// --- Estado de la aplicación ----------------------------------
let productos = [];
let categoriaActiva = TODAS;
let termino = "";
let orden = "defecto";
let soloDisponibles = false;
let ultimaTarjeta = null; // para devolver el foco al cerrar el diálogo

const soles = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// --- 1. Carga con errores diferenciados -----------------------
class ErrorCarga extends Error {
  constructor(tipo, mensaje, estadoHttp) {
    super(mensaje);
    this.tipo = tipo; // "http" | "formato" | "red" | "vacio"
    this.estadoHttp = estadoHttp;
  }
}

async function cargarProductos() {
  let respuesta;
  try {
    respuesta = await fetch(RUTA_DATOS);
  } catch {
    throw new ErrorCarga("red", `No se pudo acceder a ${RUTA_DATOS}`);
  }
  if (!respuesta.ok) {
    throw new ErrorCarga("http", `HTTP ${respuesta.status} en ${RUTA_DATOS}`, respuesta.status);
  }
  let datos;
  try {
    datos = await respuesta.json();
  } catch (e) {
    throw new ErrorCarga("formato", `JSON inválido: ${e.message}`);
  }
  if (!Array.isArray(datos)) {
    throw new ErrorCarga("formato", "El JSON debe contener un arreglo de productos");
  }
  return datos;
}

function mensajeError(error) {
  if (error.tipo === "http" && error.estadoHttp === 404) {
    return "No se encontró el archivo de productos (error 404). Revise que data/productos.json exista y esté bien escrito.";
  }
  if (error.tipo === "http") {
    return `El servidor respondió con un error (${error.estadoHttp}). Intente de nuevo en unos minutos.`;
  }
  if (error.tipo === "formato") {
    return "El archivo de productos tiene errores de formato (por ejemplo, una coma sobrante). Corrija productos.json e intente de nuevo.";
  }
  if (error.tipo === "vacio") {
    return "No hay productos válidos para mostrar.";
  }
  return "No se pudo cargar el catálogo. Verifique que abrió la página con Live Server.";
}

// --- 2. Validación de productos -------------------------------
function validarProductos(lista) {
  const ids = new Set();
  const validos = [];
  const descartados = [];
  lista.forEach((p, i) => {
    const errores = [];
    if (!p || typeof p !== "object") {
      descartados.push({ posicion: i, errores: ["no es un objeto"] });
      return;
    }
    if (!Number.isFinite(p.id)) errores.push("id no numérico");
    else if (ids.has(p.id)) errores.push(`id repetido (${p.id})`);
    if (typeof p.nombre !== "string" || !p.nombre.trim()) errores.push("nombre vacío");
    if (!Number.isFinite(p.precio) || p.precio <= 0) errores.push("precio no positivo");
    if (!Number.isInteger(p.stock) || p.stock < 0) errores.push("stock no es entero ≥ 0");
    if (typeof p.categoria !== "string" || !p.categoria.trim()) errores.push("categoría vacía");
    if (typeof p.imagen !== "string" || !EXT_VALIDAS.test(p.imagen)) errores.push("imagen con extensión no válida");
    if (errores.length) {
      descartados.push({ posicion: i, id: p.id, errores });
    } else {
      ids.add(p.id);
      validos.push(p);
    }
  });
  return { validos, descartados };
}

// --- 3. Filtros, contadores y orden ---------------------------
// Productos que cumplen buscador + stock (sin mirar la categoría)
function baseFiltrada() {
  const q = normalizar(termino.trim());
  return productos.filter(
    (p) => (!q || normalizar(p.nombre).includes(q)) && (!soloDisponibles || p.stock > 0)
  );
}

function obtenerCategorias(lista) {
  return [TODAS, ...new Set(lista.map((p) => p.categoria))];
}

function renderizarFiltros(categorias) {
  const fragmento = document.createDocumentFragment();
  categorias.forEach((cat) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "filtro";
    boton.dataset.categoria = cat;
    boton.setAttribute("aria-pressed", String(cat === categoriaActiva));
    fragmento.append(boton);
  });
  contFiltros.replaceChildren(fragmento);
  actualizarContadores();
}

// Solo cambia el textContent: los botones no se vuelven a crear
function actualizarContadores() {
  const base = baseFiltrada();
  contFiltros.querySelectorAll(".filtro").forEach((b) => {
    const cat = b.dataset.categoria;
    const total = cat === TODAS ? base.length : base.filter((p) => p.categoria === cat).length;
    b.textContent = `${cat} (${total})`;
  });
}

function ordenar(lista) {
  const copia = [...lista]; // no se modifica el original
  if (orden === "menor") copia.sort((a, b) => a.precio - b.precio);
  else if (orden === "mayor") copia.sort((a, b) => b.precio - a.precio);
  else if (orden === "nombre") copia.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return copia;
}

// --- 4. Tarjetas ----------------------------------------------
function rutaMiniatura(ruta, ancho) {
  const i = ruta.lastIndexOf("/");
  return `${ruta.slice(0, i)}/${ancho}/${ruta.slice(i + 1)}`;
}

function crearTarjeta(p) {
  const nodo = plantilla.content.cloneNode(true);
  const tarjeta = nodo.querySelector(".tarjeta");
  const img = nodo.querySelector("img");
  const etiqueta = nodo.querySelector(".etiqueta");

  tarjeta.dataset.id = p.id;
  tarjeta.tabIndex = 0;

  // srcset: miniaturas de 400 y 800 px, y el original (900 px)
  img.srcset = `${rutaMiniatura(p.imagen, 400)} 400w, ${rutaMiniatura(p.imagen, 800)} 800w, ${p.imagen} 900w`;
  img.src = p.imagen;
  img.alt = p.nombre;
  img.addEventListener("load", () => img.classList.add("cargada"), { once: true });
  img.onerror = () => {
    if (img.srcset) {
      // Faltan las miniaturas: se usa la foto original
      img.removeAttribute("srcset");
      img.src = p.imagen;
      return;
    }
    img.onerror = null;
    img.src = "img/sin-imagen.jpg";
    img.classList.add("cargada");
  };

  nodo.querySelector(".tarjeta__categoria").textContent = p.categoria;
  nodo.querySelector(".tarjeta__nombre").textContent = p.nombre;
  nodo.querySelector(".tarjeta__descripcion").textContent = p.descripcion;
  nodo.querySelector(".tarjeta__precio").textContent = soles.format(p.precio);
  nodo.querySelector(".tarjeta__porciones").textContent =
    p.porciones > 1 ? `${p.porciones} porciones` : "1 unidad";

  if (p.stock === 0) {
    etiqueta.textContent = "Agotado";
    etiqueta.classList.add("etiqueta--agotado");
    etiqueta.hidden = false;
    tarjeta.classList.add("tarjeta--agotado");
  } else if (p.destacado) {
    etiqueta.textContent = "Favorito";
    etiqueta.hidden = false;
  }
  return nodo;
}

function mostrarFantasmas() {
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < NUM_FANTASMAS; i++) {
    const li = document.createElement("li");
    li.className = "tarjeta fantasma";
    li.setAttribute("aria-hidden", "true");
    li.innerHTML =
      '<div class="tarjeta__foto"></div><div class="tarjeta__cuerpo">' +
      '<div class="linea linea--corta"></div><div class="linea"></div><div class="linea"></div></div>';
    fragmento.append(li);
  }
  grilla.replaceChildren(fragmento);
}

function textoEstado(n) {
  const donde = categoriaActiva === TODAS ? "en total" : `en «${categoriaActiva}»`;
  const q = termino.trim() ? ` que coinciden con «${termino.trim()}»` : "";
  const disp = soloDisponibles ? " (solo disponibles)" : "";
  return `Mostrando ${n} ${n === 1 ? "producto" : "productos"} ${donde}${q}${disp}.`;
}

function renderizarCatalogo() {
  const base = baseFiltrada();
  const lista = ordenar(
    categoriaActiva === TODAS ? base : base.filter((p) => p.categoria === categoriaActiva)
  );
  if (lista.length === 0) {
    grilla.replaceChildren();
    estado.textContent = "No hay productos que coincidan con los filtros.";
    return;
  }
  const fragmento = document.createDocumentFragment();
  lista.forEach((p) => fragmento.append(crearTarjeta(p)));
  grilla.replaceChildren(fragmento);
  estado.textContent = textoEstado(lista.length);
}

function actualizarVista() {
  actualizarContadores();
  renderizarCatalogo();
}

// --- 5. Hash de la URL ----------------------------------------
function categoriaDesdeHash(categorias) {
  let valor = "";
  try {
    valor = decodeURIComponent(location.hash.slice(1));
  } catch {
    valor = ""; // hash mal codificado
  }
  return categorias.includes(valor) ? valor : TODAS;
}

function guardarHash() {
  const hash = categoriaActiva === TODAS ? "" : "#" + encodeURIComponent(categoriaActiva);
  history.replaceState(null, "", location.pathname + location.search + hash);
}

// --- 6. Diálogo de detalle ------------------------------------
function abrirDetalle(tarjeta) {
  const p = productos.find((x) => x.id === Number(tarjeta.dataset.id));
  if (!p) return;
  ultimaTarjeta = tarjeta;
  const img = dialogo.querySelector("#detalle-img");
  img.src = p.imagen;
  img.alt = p.nombre;
  dialogo.querySelector("#detalle-categoria").textContent = p.categoria;
  dialogo.querySelector("#detalle-titulo").textContent = p.nombre;
  dialogo.querySelector("#detalle-descripcion").textContent = p.descripcion;
  dialogo.querySelector("#detalle-precio").textContent = soles.format(p.precio);
  dialogo.querySelector("#detalle-porciones").textContent =
    p.porciones > 1 ? `${p.porciones} porciones` : "1 unidad";
  const stock = dialogo.querySelector("#detalle-stock");
  stock.classList.toggle("agotado", p.stock === 0);
  stock.textContent =
    p.stock === 0 ? "Agotado" : p.stock <= 5 ? `¡Quedan solo ${p.stock} unidades!` : `${p.stock} unidades disponibles`;
  dialogo.showModal();
}

grilla.addEventListener("click", (e) => {
  const tarjeta = e.target.closest(".tarjeta[data-id]");
  if (tarjeta) abrirDetalle(tarjeta);
});
grilla.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".tarjeta[data-id]")) {
    e.preventDefault();
    abrirDetalle(e.target);
  }
});
dialogo.querySelector("#detalle-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (e) => {
  if (e.target === dialogo) dialogo.close(); // clic en el fondo
});
// Escape y el botón disparan "close": se devuelve el foco a la tarjeta
dialogo.addEventListener("close", () => ultimaTarjeta?.focus());

// --- 7. Eventos delegados de filtros y controles --------------
contFiltros.addEventListener("click", (e) => {
  const boton = e.target.closest(".filtro");
  if (!boton || boton.dataset.categoria === categoriaActiva) return;
  categoriaActiva = boton.dataset.categoria;
  contFiltros.querySelectorAll(".filtro").forEach((b) => {
    b.setAttribute("aria-pressed", String(b === boton));
  });
  guardarHash();
  renderizarCatalogo();
});

// "input" (buscador) y "change" (select y casilla) en un solo contenedor
function alCambiarControl(e) {
  if (e.target === buscador) termino = buscador.value;
  else if (e.target === selOrden) orden = selOrden.value;
  else if (e.target === chkDisponibles) soloDisponibles = chkDisponibles.checked;
  else return;
  actualizarVista();
}
controles.addEventListener("input", alCambiarControl);
controles.addEventListener("change", alCambiarControl);

// --- 8. Inicio y reintento ------------------------------------
function mostrarError(error) {
  console.error(error);
  estado.classList.add("estado--error");
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "btn btn--reintentar";
  boton.textContent = "Reintentar";
  boton.addEventListener("click", iniciar);
  estado.replaceChildren(mensajeError(error), boton);
  contFiltros.replaceChildren();
  grilla.replaceChildren();
  controles.hidden = true;
}

async function iniciar() {
  grilla.setAttribute("aria-busy", "true");
  estado.classList.remove("estado--error");
  estado.textContent = "Cargando productos…";
  aviso.hidden = true;
  mostrarFantasmas();
  try {
    const crudos = await cargarProductos();
    const { validos, descartados } = validarProductos(crudos);
    if (descartados.length) {
      console.warn("Productos descartados por datos inválidos:", descartados);
      aviso.textContent = `Se omitieron ${descartados.length} producto(s) con datos inválidos (ver consola).`;
      aviso.hidden = false;
    }
    if (validos.length === 0) throw new ErrorCarga("vacio", "Sin productos válidos");
    productos = validos;
    const categorias = obtenerCategorias(productos);
    categoriaActiva = categoriaDesdeHash(categorias);
    renderizarFiltros(categorias);
    controles.hidden = false;
    renderizarCatalogo();
    guardarHash(); // limpia un hash inválido
  } catch (error) {
    mostrarError(error);
  } finally {
    grilla.setAttribute("aria-busy", "false");
  }
}

iniciar();
