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

### Progreso

Sesiones, tiempo y pomodoros de los últimos 7 días, gráfico diario, rachas por rutina e
historial reciente (con opción de borrar registros sueltos).

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
src/store.js          Estado, persistencia, progreso y rachas
src/timer.js          Cuentas atrás y pomodoros, audio, avisos y wake lock
src/ui.js             Pintado de las vistas
src/app.js            Arranque y eventos
manifest.json         Manifiesto PWA
sw.js                 Service worker (uso sin conexión)
tools/                Generador de iconos y splashes
.github/workflows/    Despliegue a GitHub Pages
```

Los PNG se regeneran a partir de `assets/icon.svg` con:

```bash
NODE_PATH=$(npm root -g) node tools/generate-assets.js
```
