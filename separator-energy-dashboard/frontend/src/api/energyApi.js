import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchCurrent = () => api.get('/energy/current')
export const fetchSummary = () => api.get('/energy/summary')
export const fetchDaily = () => api.get('/energy/daily')
export const fetchTimeline = () => api.get('/energy/timeline')
export const fetchConfig = () => api.get('/config')
export const updateConfig = (data) => api.post('/config', data)
