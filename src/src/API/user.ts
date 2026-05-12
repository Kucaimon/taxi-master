import axios from 'axios'
import { IUser } from '../types/types'
import { convertUser, reverseConvertUser } from '../tools/convert'
import { addToFormData, apiMethod, IApiMethodArguments } from '../tools/api'
import Config from '../config'

const _getUser = (
  { formData }: IApiMethodArguments,
  id: IUser['u_id'],
): Promise<IUser | null> => {
  return axios.post(`${Config.API_URL}/user/${id}`, formData)
    .then(res => res.data.data)
    .then(res => convertUser(res.user[id]) || null)
}
export const getUser = apiMethod<typeof _getUser>(_getUser)

const _getUsers = (
  { formData }: IApiMethodArguments,
  ids: IUser['u_id'][],
): Promise<IUser[]> => {
  return axios.post(`${Config.API_URL}/user/${ids.join(',')}`, formData)
    .then(res => res.data.data)
    .then(res => Object.values(res.user).map(i => convertUser(i)))
}
export const getUsers = apiMethod<typeof _getUsers>(_getUsers)

const _getAuthorizedUser = (
  { formData }: IApiMethodArguments,
): Promise<IUser | null> => {
  return axios.post(`${Config.API_URL}/user/authorized`, formData)
    .then(res => res.data.data)
    .then(res => convertUser(Object.values(res.user)[0] as IUser) || null)
}
export const getAuthorizedUser = apiMethod<typeof _getAuthorizedUser>(_getAuthorizedUser)

type TEditUser = Partial<Pick<IUser, 'u_id' | 'token' | 'u_hash'>>
export type TEditClient = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_name' |
  'u_family' |
  'u_middle' |
  'u_phone' |
  'u_email' |
  'u_photo' |
  'u_lang' |
  'u_currency' |
  'ref_code' |
  'u_details'
>>
export type TEditDriverCheckRequired = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_name' |
  'u_family' |
  'u_middle' |
  'u_phone' |
  'u_email' |
  'u_photo' |
  'u_city' |
  'u_lang_skills' |
  'u_description' |
  'u_birthday' |
  'ref_code' |
  'u_details'
>>
export type TEditDriverCheckActive = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_lang' |
  'u_currency' |
  'u_gps_software' |
  'u_active' |
  'out_drive' |
  'out_address' |
  'out_latitude' |
  'out_longitude' |
  'out_est_datetime' |
  'out_s_address' |
  'out_s_latitude' |
  'out_s_longitude' |
  'out_passengers' |
  'out_luggage' |
  'ref_code' |
  'u_details'
>>

const _editUser = (
  { formData }: IApiMethodArguments,
  data:
    TEditClient |
    TEditDriverCheckRequired |
    TEditDriverCheckActive,
) => {
  // @TODO вернуть u_city когда наладим автозаполнение
  const { token, u_hash, u_id, u_city, ...userData } = data as (
    TEditClient &
    TEditDriverCheckRequired &
    TEditDriverCheckActive
  )
  if (token && u_hash && u_id) addToFormData(formData, { token, u_hash, u_id })
  addToFormData(formData, {
    data: JSON.stringify({
      u_city: u_city || undefined,
      ...reverseConvertUser(userData),
    }),
  })

  return axios.post(`${Config.API_URL}/user`, formData)
    .then(res => res.data)
}
export const editUser = apiMethod<typeof _editUser>(_editUser)
export const editUserAfterRegister = apiMethod<typeof _editUser>(_editUser, { authRequired: false })