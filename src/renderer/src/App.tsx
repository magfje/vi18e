import React, { useEffect } from 'react'
import { AppShell } from './components/layout/AppShell'
import { api } from './lib/api'
import { applyTheme } from './lib/theme'

export default function App(): React.JSX.Element {
  // Initialise theme from stored preferences on first render.
  // applyTheme() manages the system media-query listener internally, so we
  // don't need a cleanup here.
  useEffect(() => {
    api.prefs
      .get()
      .then((prefs) => applyTheme(prefs.general.theme ?? 'system'))
      .catch(() => applyTheme('system'))
  }, [])

  return <AppShell />
}
