import axios from 'axios'

export const getCacheVersion = (url: string) =>
  axios
    .get(`${url}/?cv=`, { timeout: 15000 })
    .then(response => response?.data['cache version'])
