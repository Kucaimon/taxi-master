import axios from 'axios'

export const getCacheVersion = (url: string) =>
  axios
    .get(`${url}/?cv=`, { timeout: 5000 })
    .then(response => response?.data['cache version'])
