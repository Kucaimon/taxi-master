import React, { useEffect } from 'react'
import { EUserRoles } from '../../types/types'
import { useDispatch } from '../../tools/hooks'
import { setRefCodeModal } from '../../state/modals/actionCreators'
import { ERegistrationType } from '../../state/user/constants'
import ModalStack from './ModalStack'

export function ModalHost() {
  const dispatch = useDispatch()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const email = params.get('u_email')
    const name = params.get('u_name')

    if (email && name)
      dispatch(setRefCodeModal({
        isOpen: true,
        data: {
          u_name: decodeURIComponent(name).replaceAll('+', ' '),
          u_phone: '',
          u_email: decodeURIComponent(email),
          type: ERegistrationType.Email,
          u_role: EUserRoles.Client,
          ref_code: '',
          u_details: {},
          st: '1',
        },
      }))
  }, [])

  return <ModalStack />
}