export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Hard edges everywhere: the rounded-* utilities simply do not exist in this build.
  corePlugins: { borderRadius: false },
  theme: {
    extend: {
      // Lospec "Dungeon-20" "Abyss" deep darker theme, named by role so components stay readable.
      colors: {
        face: '#211a28',      /* panel face */
        facelite: '#39424c',  /* raised outer highlight */
        shade: '#141a21',     /* bevel inner shadow */
        wdark: '#120d14',     /* deepest tone / outline */
        plum: '#221826',
        wine: '#4a1c2b',
        blood: '#b5505a',     /* war / danger */
        ember: '#cd6a3f',     /* building / caution */
        gold: '#f7b14e',      /* highlight / ready accent */
        steel: '#1a232c',     /* field well */
        teal: '#27424d',      /* title bar base */
        sky: '#5696b4',       /* link */
        cyan: '#57c7d0',      /* trade / positive */
        parchment: '#ede48f',
        bone: '#e3e6de',      /* primary text */
        moss: '#aca587',
        clay: '#937c72',
        slate: '#4d4550',
        iron: '#4c5a57',      /* bevel inner highlight */
        ash: '#a8b0a0',       /* secondary text */
        ink: '#e3e6de',       /* alias for primary text */
      },
      fontFamily: {
        sans: ['Tahoma', '"MS Sans Serif"', '"Microsoft Sans Serif"', 'Verdana', 'Geneva', 'sans-serif'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
      fontSize: {
        xx: ['10px', { lineHeight: '13px' }],
        xs: ['11px', { lineHeight: '14px' }],
        sm: ['12px', { lineHeight: '16px' }],
        base: ['12px', { lineHeight: '16px' }],
        md: ['13px', { lineHeight: '17px' }],
        lg: ['15px', { lineHeight: '19px' }],
        xl: ['18px', { lineHeight: '22px' }],
        xxl: ['22px', { lineHeight: '26px' }],
        hero: ['30px', { lineHeight: '32px' }],
      },
      boxShadow: {
        raised:
          'inset -1px -1px 0 0 #120d14, inset 1px 1px 0 0 #4c5a57, inset -2px -2px 0 0 #141a21, inset 2px 2px 0 0 #39424c',
        sunken:
          'inset -1px -1px 0 0 #4c5a57, inset 1px 1px 0 0 #120d14, inset -2px -2px 0 0 #39424c, inset 2px 2px 0 0 #141a21',
      },
    },
  },
  plugins: [],
};
