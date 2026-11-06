import { mount } from 'svelte'
import { isTauri } from '@tauri-apps/api/core'
import './app.css'
import App from './App.svelte'

if (!isTauri()) document.documentElement.classList.add('web')

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
