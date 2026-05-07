import React, { useCallback, useState, useEffect, useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import {
  EStatuses, EUserRoles, EUserCheckStates,
  IUser, ICar,
} from '../../types/types'
import images from '../../constants/images'
import { getBase64 } from '../../tools/utils'
import { formatPhoneNumber, normalizePhoneNumber } from '../../tools/phoneUtils'
import * as API from '../../API'
import {
  TEditClient,
  TEditDriverCheckRequired,
  TEditDriverCheckActive,
} from '../../API/user'
import { getImageFile } from '../../API'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { defaultProfileModal } from '../../state/modals/reducer'
import { userSelectors, userActionCreators } from '../../state/user'
import { carsSelectors, carsActionCreators } from '../../state/cars'
import { configSelectors, configActionCreators } from '../../state/config'
import { t, TRANSLATION } from '../../localization'
import JSONForm from '../JSONForm'
import { TForm } from '../JSONForm/types'
import ErrorFrame from '../ErrorFrame'
import Overlay from './Overlay'
import './styles.scss'

const CLIENT_FIELDS = new Set<keyof TEditClient>([
  'u_role',
  'u_name',
  'u_family',
  'u_middle',
  'u_phone',
  'u_email',
  'u_photo',
  'u_lang',
  'u_currency',
  'ref_code',
  'u_details',
])
const DRIVER_CHECK_REQUIRED_FIELDS = new Set<
  keyof TEditDriverCheckRequired
>([
  'u_role',
  'u_name',
  'u_family',
  'u_middle',
  'u_phone',
  'u_email',
  'u_photo',
  'u_city',
  'u_lang_skills',
  'u_description',
  'u_birthday',
  'ref_code',
  'u_details',
])
const DRIVER_CHECK_ACTIVE_FIELDS = new Set<
  keyof TEditDriverCheckActive
>([
  'u_role',
  'u_lang',
  'u_currency',
  'u_gps_software',
  'u_active',
  'out_drive',
  'out_address',
  'out_latitude',
  'out_longitude',
  'out_est_datetime',
  'out_s_address',
  'out_s_latitude',
  'out_s_longitude',
  'out_passengers',
  'out_luggage',
  'ref_code',
  'u_details',
])
const CAR_FIELDS = new Set<keyof Parameters<typeof API.editCar>[1]>([
  'cm_id',
  'seats',
  'registration_plate',
  'color',
  'photo',
  'details',
  'cc_id',
])

const mapStateToProps = (state: IRootState) => ({
  tokens: userSelectors.tokens(state),
  user: userSelectors.user(state),
  car: carsSelectors.userPrimaryCar(state),
  language: configSelectors.language(state),
  isOpen: modalsSelectors.isProfileModalOpen(state),
})

const mapDispatchToProps = {
  setProfileModal: modalsActionCreators.setProfileModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  updateUser: userActionCreators.initUser,
  getUserCars: carsActionCreators.getUserCars,
  editCar: carsActionCreators.edit,
  setLanguage: configActionCreators.setLanguage,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function ProfileModal({
  tokens,
  user,
  car,
  language,
  isOpen,
  setProfileModal,
  setMessageModal,
  updateUser,
  getUserCars,
  editCar,
  setLanguage,
}: IProps) {
  const onChangeAvatar = useCallback((e: any) => {
    const file = e.target.files[0]
    if (!user || !tokens || !file) return
    getBase64(file)
      .then((base64: any) => API.editUser({ u_photo: base64 }))
      .then(() => updateUser())
      .catch(error => alert(JSON.stringify(error)))
  }, [user, tokens])

  useEffect(() => {
    getUserCars()
  }, [])

  const [passportPhoto, setPassportPhoto] =
    useState<[number, File][] | null>(null)
  const [driverLicensePhoto, setDriverLicensePhoto] =
    useState<[number, File][] | null>(null)
  useEffect(() => {
    if (!isOpen) return
    const passportImgs = user?.u_details?.passport_photo || []
    const driverLicenseImgs = user?.u_details?.driver_license_photo || []
    Promise.all(passportImgs.map(getImageFile)).then(setPassportPhoto)
    Promise.all(driverLicenseImgs.map(getImageFile)).then(setDriverLicensePhoto)
  }, [isOpen])

  type TFormValues = Omit<IUser, 'u_details'> & {
    u_details: Omit<IUser['u_details'],
      'passport_photo' |
      'driver_license_photo'
    > & {
      passport_photo: [number, File][],
      driver_license_photo: [number, File][]
    }
    u_car: ICar | null
  }

  const isValuesLoaded = !!(
    user &&
    car !== undefined &&
    passportPhoto &&
    driverLicensePhoto
  )
  const defaultValues: TFormValues | {} = useMemo(() => isValuesLoaded ?
    {
      ...user,
      u_phone: user.u_phone ? formatPhoneNumber(user.u_phone) : '',
      u_details: {
        ...user.u_details,
        passport_photo: passportPhoto,
        driver_license_photo: driverLicensePhoto,
      },
      u_car: car,
    } :
    {}
  , [isValuesLoaded, user, car, passportPhoto, driverLicensePhoto])

  const [ isSubmittingForm, setIsSubmittingForm ] = useState(false)
  const [ errors, setErrors ] = useState<Record<string, any>>({})

  const handleChange = useCallback((name: string, value: any) => {
    setErrors({
      ...errors,
      [name]: false,
    })
  }, [errors])

  async function handleSubmitForm(formValues: TFormValues) {
    const {
      u_details: { passport_photo, driver_license_photo, ...u_details },
      u_car,
      ...values
    } = formValues

    if ('u_phone' in values && values.u_phone) {
      values.u_phone = normalizePhoneNumber(
        values.u_phone,
        false,
        user!.u_role === EUserRoles.Driver,
      )
    }

    if (values.ref_code && values.ref_code !== user!.ref_code) {
      const res = await API.checkRefCode(values.ref_code)
      if (!res) {
        setErrors({
          ref_code: true,
        })
        return
      }
    }

    setIsSubmittingForm(true)

    if (user!.u_role === EUserRoles.Client) {
      try {
        await API.editUser(Object.fromEntries(Object.entries(values)
          .filter(([key]) => CLIENT_FIELDS.has(key as any)),
        ) as any)
        updateUser()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.SUCCESS_PROFILE_UPDATE_MESSAGE),
        })
      } catch {
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: 'An error occured',
        })
      }
      setIsSubmittingForm(false)
      return
    }

    if (car) {
      const res = await editCar(
        car.c_id,
        Object.fromEntries(Object.entries(u_car!)
          .filter(([key]) => CAR_FIELDS.has(key as any)),
        ) as any,
      )
      const isError = res.message === 'busy registration plate'
      if (isError) {
        setErrors({
          ...errors,
          'u_car.registration_plate': true,
        })
        setIsSubmittingForm(false)
        return
      }
    }

    const imagesKeys = ['passport_photo', 'driver_license_photo']
    const images = [passport_photo ?? [], driver_license_photo ?? []]
    const imagesMap: Record<string, any> = {}

    try {
      await Promise.all(images.map((imageList: [any, File][], i) => {
        const key: string = imagesKeys[i]
        if (!imagesMap[key]) imagesMap[key] = []
        return Promise.all(
          imageList
            .map((image: [any, File]) => {
              if (image[0]) imagesMap[key].push(image[0])
              return image
            })
            .filter((image: [any, File]) => !image[0])
            .map((image: [any, File]) =>
              API.uploadFile({
                file: image[1],
                u_id: user!.u_id,
                token: tokens?.token,
                u_hash: tokens?.u_hash,
              }).then(res => {
                if (res?.dl_id) imagesMap[key].push(res.dl_id)
              }),
            ),
        )
      }))

      const fields = user!.u_check_state === EUserCheckStates.Required ||
        !user!.u_check_state ?
        DRIVER_CHECK_REQUIRED_FIELDS :
        user!.u_check_state === EUserCheckStates.Active ?
          DRIVER_CHECK_ACTIVE_FIELDS :
          new Set()
      try {
        await API.editUser({
          ...Object.fromEntries(Object.entries(values)
            .filter(([key]) => fields.has(key as any)),
          ) as any,
          u_details: { ...u_details, ...imagesMap },
        })
        updateUser()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.SUCCESS_PROFILE_UPDATE_MESSAGE),
        })
      } catch {
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: 'An error occured',
        })
      }
    }

    finally {
      setIsSubmittingForm(false)
    }
  }

  const formState = useMemo(() => ({
    pending: isSubmittingForm,
  }), [isSubmittingForm])

  let fields = useMemo(() => {
    try {
      const formStr = (window as any).data?.site_constants?.form_profile?.value
      return (JSON.parse(formStr).fields as TForm) ?? null
    } catch {
      return null
    }
  }, [])

  const isClient = user?.u_role === EUserRoles.Client
  fields = useMemo(() => fields && isClient ?
    fields.filter(field =>
      (field.name && CLIENT_FIELDS.has(field.name as any)) ||
      field.type === 'submit',
    ) :
    fields
  , [isClient])

  if (fields === null)
    return <ErrorFrame title='Bad json in data.js' />

  return isOpen && (
    <Overlay
      isOpen={isOpen}
      onClick={() => setProfileModal({ ...defaultProfileModal })}
    >
      <div
        className="modal profile-modal"
      >
        <fieldset>
          <legend>{t(TRANSLATION.PROFILE)}</legend>
          <div className="avatar">
            {isValuesLoaded ?
              <label>
                <div className="avatar_image">
                  <div
                    className="avatar_image_bg"
                    style={{
                      backgroundImage: `url(${user?.u_photo || images.driverAvatar})`,
                    }}
                    title={user?.u_name || ''}
                  />
                </div>
                <input
                  onChange={onChangeAvatar}
                  type="file"
                  className="avatar_input"
                />
              </label> :
              <svg width="100" height="100" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" stroke="#000">
                <g fill="none" fillRule="evenodd">
                  <g transform="translate(1 1)" strokeWidth="2">
                    <circle strokeOpacity=".5" cx="18" cy="18" r="18"/>
                    <path d="M36 18c0-9.94-8.06-18-18-18">
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 18 18"
                        to="360 18 18"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </g>
                </g>
              </svg>
            }
          </div>
          {isValuesLoaded &&
            <JSONForm
              defaultValues={defaultValues}
              fields={fields}
              onSubmit={handleSubmitForm}
              onChange={handleChange}
              state={formState}
              errors={errors}
            />
          }
        </fieldset>
      </div>
    </Overlay>
  )
}

export default connector(ProfileModal)