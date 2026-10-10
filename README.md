# dashboard-comparativo

Sistema de Reporte Esquematizado (Dashboard) para los informes que exporta **Advance DMS Software** en SUMOTO S.A.
Todo se procesa en el navegador: los archivos **no se envían a ningún servidor**.

## Requisitos

- Node.js 18 o superior (recomendado 20 o 22)
- npm 9 o superior

## Instalación y ejecución

```bash
npm install
npm run dev
```

Abre la dirección que muestra la consola (normalmente http://localhost:5173).

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run build` | Revisa tipos y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve la versión de producción para probarla |
| `npm run typecheck` | Solo revisa tipos de TypeScript |

## Flujo

1. **Inicio**: elige "Cargar un solo documento Excel" (comparativas dentro del archivo) o "Cargar dos documentos Excel para comparar".
2. **Carga**: arrastra o selecciona los archivos (.xlsx, .xlsm, .xls, máx. 60 MB).
3. **GENERAR DASHBOARD / EMPEZAR ANÁLISIS**: el Excel se lee en un Web Worker y se detectan las hojas automáticamente.
4. **Revisión de hojas** (solo si el archivo tiene muchas hojas, hojas sin estructura u hojas contables): muestra cómo se
   interpretó cada hoja (tipo, periodos, pesos o motos) y permite incluir o excluir hojas. Las hojas contables o con datos
   de terceros y socios quedan desmarcadas por defecto. Desde el dashboard se vuelve con "Elegir hojas".
5. **Dashboard**: la barra lateral lista las **hojas** de cada Excel (no las tablas). Si una hoja contiene varias tablas
   (ej: VENTA MOTOS → por sede y por marca) se eligen dentro de la hoja con "Tablas de esta hoja".
   **Descargar informe HTML** genera un documento autónomo con todos los reportes cargados, sus gráficas y tablas completas; no depende de la hoja que esté seleccionada.

En la pantalla de carga, con 1 o con 2 documentos, el botón **"Agregar documento adicional"** permite sumar reportes
complementarios (ej: Comparativo RUNT). Se muestran como hojas aparte y nunca se emparejan con los demás.

### Entornos de reporte (formato del reporte de gerencia)

Cada tabla comparativa se presenta con la misma estructura del HTML de referencia (`sumoto_dashboard_mayo_vfinal_Runt.html`):

| Vista | Contenido |
|---|---|
| **Vista general** | 4 KPIs con franja de color (total año actual acumulado, total año anterior, marca líder, mayor crecimiento), barras por marca año vs año, dona por marca, dona por punto de venta (top 10), evolución mensual año vs año y tabla con Var. %, Part. % y barra de tendencia. |
| **Una vista por marca** | Se crea automáticamente por cada grupo de la tabla (Suzuki, AKT, Hero, Bajaj, Honda, Fratelly…): KPIs, barras por agencia, dona por tienda, mensual de la marca y tabla. |
| **Mes vs mes anterior** | Ej: "Ago vs Sep 2026": KPIs, barras y dona por marca del último mes y tabla por punto de venta. |
| **RUNT Nacional & Valle** | KPIs de mercado, donas de participación, volumen por marca año vs año, tabla de shares y, si el archivo trae la tabla "COMPARATIVO SUMOTO", la participación de Sumoto en el mercado del Valle. |

Arriba de cada vista se puede elegir el **corte** (mes) y si se muestra el **acumulado del año** o **solo el mes**.
Todas las gráficas muestran, al pasar el cursor, el **valor y los porcentajes** (participación sobre el total y variación
frente al otro periodo).

Cuando una tabla no rotula las marcas y solo las separa con filas TOTAL / GRAN TOTAL (ej: MOTOS COMPARATIVO), el sistema
deduce los grupos sumando filas y les pone el nombre de la marca que aparece en sus sedes (configurable en `MARCAS`).
   Botón "Imprimir o guardar PDF" para exportar la vista actual.

Para probar sin archivos usa "Probar con datos de ejemplo" (datos ficticios de `src/data/ejemplo.ts`).

## Tipos de hoja que reconoce

| Tipo | Ejemplo | Cómo se detecta |
|---|---|---|
| **Matriz** (informe consolidado) | INFORME COMERCIAL MES DE SEPTIEMBRE 2026 | Fila de métricas (META, MOSTRADOR, TALLER, TOTAL VENTAS…) seguida de una fila de periodos (fechas o años). Filas sin valores = grupo/marca. Filas TOTAL = subtotales. |
| **Base plana** (registros) | BASE REPUESTOS 2026, BASE MANO DE OBRA…, INSUMOS…, Grd_… (facturas de motos) | Primera fila con mayoría de textos y datos debajo (en el DMS es la fila 5). La fila final de SUBTOTAL se descarta. En facturas de motos la medida por defecto son las unidades. |
| **Tabla por bloques** | INFORME DE VENTAS GERENCIA (VENTA MOTOS, MOTOS COMPARATIVO…), informe comparativo, comparativo agosto | Encabezado con fechas, meses en texto ("ENERO", "SEPT") o años, en cualquier columna, con varias tablas por hoja (SEDE, ASESOR, MODELO, FINANCIERA) y bloques por marca. |
| **Ejecución presupuestal** | EJECUCION PRESUPUESTAL 2026 (RESUMEN GENERAL y hojas por marca) | Se integra como un documento normal: resumen por marca y tablas por hoja de marca para presupuesto por sede, ejecución por sede, ejecución por modelo y detalle de modelo por sede. El presupuesto se asigna como meta y la ejecución como valor real. |
| **Tabla dinámica** | INFORME MES DE SEPTIEMBRE (ASESOR Y FINANCIERA, MARCA Y FINANCIERA, AGENCIAS Y FINANCIERAS) | Encabezados "Etiquetas de fila/columna" o secciones "Suma de cant". Las series se grafican por categoría; totales y participaciones se recalculan desde el detalle. |

Una misma hoja puede generar varios reportes (ej: "comparativo - Sede" y "comparativo - Asesor").
Los comparativos mensuales con columnas de porcentaje intercaladas (ej: COMPARATIVO MES A MES y ACUMULADO 2025-2026) usan solo las columnas de cantidades y reconstruyen las series mensuales.

### Pesos o unidades

Cada tabla detecta su unidad: si más del 20 % de los valores tiene decimales o la mediana supera 100.000, son **pesos**
($ 460,0 M); si no, son **cantidades** (3.410 motos). Si alguna tabla del archivo es de motos, las demás tablas de
cantidades del mismo archivo también se rotulan "motos". KPIs, tablas y gráficas usan esa unidad.

La estructura completa está documentada en `src/data/ejemplo.ts`.

## Criterios de cálculo

- **Totales, cumplimientos y variaciones se recalculan** desde las filas de detalle. Las filas TOTAL y los % del Excel solo se usan para el control de calidad, que se muestra como nota al pie de cada reporte.
- **Cumplimiento** = valor / meta del mismo periodo.
- **Variación %** = (actual − comparación) / |comparación|.
- **Periodo por defecto**: el último mes **cerrado** con datos reales (no el mes en curso, ni meses futuros vacíos, ni meses casi vacíos al final).
- **Comparación por defecto** (matrices): mismo mes del año anterior; si no existe, el periodo anterior.
- **Tablas por bloques**: DIFERENCIA, INCR/DECR, CRECIMIENTO, % y PARTICIPACIÓN del Excel se recalculan. Las filas debajo del último TOTAL (desgloses tipo "Gerencia", "COMERCIAL") no se suman. Si un mismo mes aparece en varios bloques con cifras distintas, gana el bloque más reciente y se informa en las notas del reporte. En encabezados con fechas arriba y medidas abajo, cada medida se conserva por separado. En `DESEMBOLSO FINANCIERAS`, las secciones de participación y desembolsos se muestran por separado y las columnas de unidades en pesos se grafican como dinero.
- **Comparativos financieros**: `COMPARATIVO MES A MES` y `ACUMULADO 2025-2026` conservan sus series mensuales y excluyen porcentajes/participaciones del Excel. `MARCA Y FINANCIERA` usa su tabla dinámica principal para evitar reportar de nuevo los mismos datos en sus desgloses. `EJECUCION DE FINANCIERAS` interpreta cada grupo `MEGAS / mes / cumplimiento` como meta, ejecutado y porcentaje recalculado.
- **Control de calidad**: totales del Excel vs recalculados, % de cumplimiento mal referenciados, años de encabezado fuera de patrón (ej: 2926), datos en meses que aún no han ocurrido y hojas del mismo archivo actualizadas a meses distintos.
- **Dos documentos**: Documento 1 = actual, Documento 2 = referencia. En bases planas, por defecto solo se comparan los meses presentes en ambos archivos (se puede desactivar).
- **Margen** = utilidad / medida, solo si la base trae columna de utilidad.

## Supuestos a validar

- **Marca por código de bodega** (1xx Suzuki, 2xx AKT, 3xx Bajaj, 4xx Hero, 5xx Honda). Se dedujo del Informe comercial y crea la dimensión "Marca (por código de bodega)" en las bases planas. Ajústalo en `src/config/negocio.ts`.
- **Umbrales de cumplimiento**: verde ≥ 100 %, ámbar 80–99 %, rojo < 80 %. Editables en el mismo archivo.
- **Hojas omitidas y confidenciales**: `HOJAS_NO_PROCESAR` (hoy: TERCEROS, por tamaño) y `HOJAS_CONFIDENCIALES` (estados financieros, contabilidad, socios y pagarés pendientes, que se cargan desmarcados) en `src/config/negocio.ts`.
- **Encabezados con un solo mes por año** (ej: VENTA MOTOS "sep-25 / sep-26"): se rotulan como ese mes, pero en el Informe de gerencia las fórmulas muestran que son **acumulados enero–septiembre**. El reporte lo advierte en sus notas.

## Estructura del proyecto

```
src/
├── config/negocio.ts        ← reglas y palabras clave editables (umbrales, métricas, columnas)
├── data/ejemplo.ts          ← estructura esperada de los Excel + datos ficticios de prueba
├── types/report.ts          ← modelo de datos (contrato entre parser, análisis y UI)
├── parser/
│   ├── readWorkbook.ts      ← lectura con SheetJS (fechas sin desfase de zona horaria)
│   ├── detect.ts            ← decide si la hoja es matriz o base plana
│   ├── matrixParser.ts      ← parser de informes consolidados
│   ├── blockParser.ts       ← parser de tablas por bloques (meses/años, varias tablas por hoja)
│   ├── pivotParser.ts       ← parser de tablas dinámicas por categoría y financiera
│   ├── executionParser.ts   ← parser de metas MEGAS y ejecución mensual por financiera
│   ├── runtParser.ts        ← parser del comparativo RUNT (mercados + ventas propias)
│   ├── cells.ts             ← utilidades de celdas sin SheetJS
│   ├── flatParser.ts        ← parser de bases de registros
│   ├── excel.worker.ts      ← Web Worker (procesa fuera del hilo principal)
│   └── index.ts             ← validación de archivos + API para la UI
├── analysis/
│   ├── matrix.ts            ← KPIs, series y control de calidad de matrices
│   ├── flat.ts              ← agregaciones de bases planas
│   ├── compare.ts           ← emparejamiento de hojas y Doc. 1 vs Doc. 2
│   ├── env.ts               ← modelo de los entornos de reporte (acumulado, mensual, marcas, mes vs mes)
│   ├── sheets.ts            ← agrupa los reportes por hoja para la navegación
│   └── flatFormat.ts        ← formato de medidas de bases planas (pesos / unidades)
├── store/useAppStore.ts     ← estado global (Zustand)
├── components/ui/           ← componentes shadcn/ui
├── components/ErrorBoundary.tsx ← si un reporte falla, muestra aviso y el resto sigue funcionando
├── features/
│   ├── onboarding/          ← pantalla inicial y carga de archivos
│   ├── processing/          ← pantalla de progreso
│   ├── review/              ← revisión y selección de hojas
│   └── dashboard/           ← navegación por hojas, reportes, gráficas (Recharts + Chart.js) y tablas
│       └── env/             ← entornos de reporte (vista general, marcas, mes vs mes, RUNT)
├── lib/units.ts             ← formato según unidad (pesos o motos) y detección de unidad
└── lib/format.ts            ← formatos es-CO (pesos, %, meses)
```

## Ajustes frecuentes

| Quiero… | Archivo |
|---|---|
| Cambiar colores corporativos | `src/index.css` (variables `--primary`, `--positive`, …) y `src/features/dashboard/charts/theme.ts` |
| Reconocer otra palabra como "meta" o como total | `src/config/negocio.ts` → `METRICAS` |
| Cambiar la medida o dimensión por defecto de las bases | `src/config/negocio.ts` → `PRIORIDAD_MEDIDA`, `PRIORIDAD_DIMENSION` |
| Cambiar cómo se acortan los nombres de bodega | `src/lib/format.ts` → `shortLabel` |
| Marcar o desmarcar hojas por defecto en la revisión | `src/config/negocio.ts` → `HOJAS_CONFIDENCIALES` |
| Cambiar el criterio pesos vs unidades | `src/lib/units.ts` → `detectUnit` |
| Agregar una marca o cambiar sus colores | `src/config/negocio.ts` → `MARCAS` |
| Cambiar el nombre de la empresa en el reporte RUNT | `src/config/negocio.ts` → `EMPRESA` |
| Cambiar el logo del encabezado | `src/assets/logo-sumoto.png` |
| Agregar componentes shadcn/ui | `npx shadcn@latest add <componente>` (ya existe `components.json`) |

## Stack

React 18 + Vite 5 (TypeScript), Tailwind CSS 3 + shadcn/ui (Radix), Recharts + Chart.js, SheetJS (xlsx), Zustand, tipografía Inter.
