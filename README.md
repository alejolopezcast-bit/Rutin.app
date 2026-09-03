# Rutin.app

App para llevar tu rutina diaria, tus tareas pendientes y tus pomodoros. Cada hábito
se registra **por veces** (pulsas el botón y suma una sesión) o **por tiempo** (pulsas
y arranca una cuenta atrás), o las dos cosas a la vez.

No necesita servidor ni cuenta: es HTML, CSS y JavaScript sin dependencias, y tus datos
se guardan en el navegador (`localStorage`).

## Instalarla en el iPhone

La app está preparada para funcionar como una app de iOS instalada desde Safari:

1. Abre la URL de la app **en Safari** (no vale Chrome: en iOS solo Safari puede instalar).
2. Toca **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio** → **Añadir**.

Aparece con su icono junto al resto de apps y se abre a pantalla completa, sin la barra de
Safari. Funciona sin conexión y tus datos se quedan en el móvil.

Qué se cuidó para que se comporte como una app nativa:

- Icono propio, pantallas de arranque para los iPhone más comunes y color de barra de
  estado que sigue al tema claro/oscuro.
- Respeta el notch, la Dynamic Island y la barra de inicio (`safe-area-inset`).
- Sin zoom al tocar un campo, sin rebote de la página, sin menú de selección al mantener
  pulsado y botones de 44 px, el mínimo táctil que recomienda Apple.
- Para elegir una duración distinta se abre una hoja inferior con duraciones frecuentes,
  en vez del cuadro de diálogo del navegador.
- El sonido de aviso se desbloquea con tu primer toque (Safari lo exige).
- La pantalla no se apaga mientras corre una cuenta atrás (Screen Wake Lock).

### Límites de iOS que conviene conocer

- **Con la app cerrada o el móvil bloqueado, iOS congela el JavaScript**: no sonará el
  aviso ni llegará una notificación al terminar una cuenta atrás. La cuenta atrás **no se
  pierde**: al volver a la app se recalcula por marca de tiempo, la sesión queda registrada
  con sus minutos y verás el aviso «Se completó una sesión mientras no mirabas».
- Las **notificaciones** en iOS solo funcionan con la app añadida a la pantalla de inicio
  (iOS 16.4 o superior) y mientras la app esté abierta.
- Si necesitas avisos con la app cerrada, hace falta una app nativa de verdad
  (Capacitor o SwiftUI); esta versión no puede darlos.

### Sobre el "sistema de usuarios"

Los perfiles y el compartir funcionan **sin servidor ni cuentas**: todo vive en el
dispositivo y las rutinas se pasan por enlace o código. Eso encaja con una app estática
que se publica en GitHub Pages y se instala en el iPhone.

Lo que esto **no** hace: no hay inicio de sesión, ni sincronización entre dispositivos, ni
un muro común de rutinas. Para eso haría falta un backend (por ejemplo Supabase o Firebase)
con autenticación y base de datos; el modelo de datos ya está separado por perfil, así que
esa capa se podría añadir encima sin rehacer la app.

## Publicarla

El repositorio incluye `.github/workflows/pages.yml`, que publica la app en **GitHub Pages**
en cada `push` a `main`. Para activarlo: en GitHub, *Settings → Pages → Source: GitHub Actions*
(el repositorio debe ser público, o tener un plan de pago). La URL queda en
`https://<usuario>.github.io/Rutin.app/`.

## Cómo usarla en el ordenador

Abre `index.html` en el navegador. Si prefieres servirla (necesario para instalarla como
app y para el modo sin conexión):

```bash
npx http-server -p 8080 .   # y abre http://localhost:8080
```

En Ajustes tienes **Cargar rutina de ejemplo** para ver la app con datos.

## Qué puede hacer

### Rutinas

Al crear una rutina eliges cómo la quieres registrar:

| Modo | Cómo se usa | Ejemplo |
| --- | --- | --- |
| **Por veces** | Pulsas el botón y suma una sesión hecha. La meta es un número de veces al día. | Gimnasio 1 vez al día, beber agua 8 veces |
| **Por tiempo** | Pulsas y arranca una cuenta atrás. Al acabar se registra la sesión con sus minutos. | Leer 30 min, meditar 10 min |
| **Las dos** | Tienes los dos botones: marcas rápido o cronometras según el día. | Gimnasio: unos días lo marcas, otros cronometras la hora |

Además de eso:

- **Días de la semana**: cada rutina se programa en los días que quieras. Los días que
  no toca siguen visibles con la etiqueta *Hoy no toca*, por si te apetece hacerla igual.
- **⏱ Otra duración**: arranca la cuenta atrás con los minutos que le digas, no sólo con
  los de la rutina.
- **↺ Deshacer**: quita el último registro del día si te has equivocado.
- **Rachas**: días seguidos cumpliendo la rutina.

### Cuenta atrás

Cuando hay una sesión en marcha aparece una barra flotante con el tiempo restante:

- **Pausar / Reanudar** sin perder lo que llevas.
- **Terminar** registra los minutos hechos hasta ese momento.
- **✕** cancela sin registrar nada.
- La sesión sobrevive a recargas y a cerrar la pestaña: al volver sigue en su sitio (y si
  el tiempo se cumplió mientras no estabas, queda registrada).
- Avisa con un sonido y, si le das permiso, con una notificación del navegador.

### Tareas y pomodoros

- Lista de pendientes con pomodoros estimados (`0/3 🍅`) y los que ya llevas.
- El botón 🍅 de una tarea abre el pomodoro ya asociado a ella: cada pomodoro completado
  se le suma.
- Duraciones configurables (concentración, descanso corto, descanso largo y cada cuántos
  pomodoros toca el largo) y opción de encadenarlos automáticamente.

### Calendario

Vista mensual navegable donde cada día se tiñe según el porcentaje de rutinas que
cumpliste de las que tocaban: de un vistazo se ve dónde flojeaste. Al tocar un día se
abre su detalle con cada rutina, lo que hiciste y lo que quedó pendiente.

### Informe

El mismo informe en cuatro escalas: **día**, **mes**, **año** y **hasta ahora**, con
flechas para moverte por periodos.

- Porcentaje de cumplimiento (cumplidas / las que tocaban), sesiones, tiempo y pomodoros.
- Gráfico que se adapta al periodo: por franjas horarias en un día, por días en un mes,
  por meses en un año o en todo el historial.
- Desglose rutina a rutina con su porcentaje y su detalle.
- Historial del periodo, con opción de borrar registros sueltos.

### Perfiles y rutinas compartidas

Varios perfiles conviven en el mismo dispositivo, cada uno con sus rutinas, tareas e
historial. Se cambia de perfil desde la chapa de la cabecera.

Para compartir rutinas con otra persona hay tres caminos, y en los tres viaja **solo la
definición de las rutinas**: nunca tu historial, tus tareas ni tus datos.

| Cómo | Para qué |
| --- | --- |
| **Enlace** | Se copia (o se abre el menú de compartir de iOS) y quien lo reciba verá un diálogo para añadirlas. Las rutinas viajan dentro del propio enlace, en el fragmento `#compartir=…`, así que **no pasan por ningún servidor**. |
| **Código** | El mismo contenido en texto, para pegar donde quieras. Se importa desde *Ajustes → Rutinas compartidas*. |
| **Otro perfil** | Copia las rutinas a otro perfil del mismo dispositivo, sin salir de la app. |

Al importar se ve primero qué llega y a qué perfil va; nada se añade sin confirmar, y las
rutinas que ya tengas con el mismo nombre no se duplican. Como el contenido de un enlace
viene de fuera, al entrar se valida y se acota: nombres, emojis, números y días fuera de
rango se recortan o se descartan.

### Tus datos

Todo vive en tu navegador. En Ajustes puedes **exportar** una copia en JSON, **importarla**
en otro dispositivo o **borrar** todo. Servida por HTTP se instala como app (PWA) y funciona
sin conexión.

## Estructura

```
index.html            Estructura de las vistas, hojas y diálogos
assets/styles.css     Estilos (tema oscuro y claro, áreas seguras de iOS)
assets/icon.svg       Icono vectorial
assets/icons/         Iconos PNG (iOS y manifiesto)
assets/splash/        Pantallas de arranque de iOS
src/store.js          Estado, perfiles, informes, calendario y compartir
src/timer.js          Cuentas atrás y pomodoros, audio, avisos y wake lock
src/ui.js             Pintado de las vistas
src/app.js            Arranque y eventos
manifest.json         Manifiesto PWA
sw.js                 Service worker (uso sin conexión)
tools/                Generador de iconos y splashes
tests/                Pruebas automáticas
.github/workflows/    Despliegue a GitHub Pages
```

## Pruebas

```bash
npm i -g playwright && playwright install chromium   # sólo la primera vez
./tests/run.sh
```

Levanta un servidor estático y ejecuta cuatro suites: la lógica del store sin navegador
(migración de datos, informes, calendario y validación de lo que llega por un enlace
compartido) y tres en navegador (la app en escritorio, las funciones nuevas y el perfil de
un iPhone). Son 152 comprobaciones.

Los PNG se regeneran a partir de `assets/icon.svg` con:

```bash
NODE_PATH=$(npm root -g) node tools/generate-assets.js
```
