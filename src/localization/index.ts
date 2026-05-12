import store from '../state'
import CATEGORIES from './categories'
import TRANSLATION from './translation'
import { configSelectors } from '../state/config'

interface IOptions {
  /** Does result.toLowerCase() */
  toLower?: boolean,
  /** Does result.toUpperCase() */
  toUpper?: boolean
}

const FALLBACK_TRANSLATIONS: Record<string, Record<string, string>> = {
  password: {
    ru: 'Пароль',
    en: 'Password',
    fr: 'Mot de passe',
    ar: 'كلمة المرور',
  },
  password_confirm: {
    ru: 'Повторите пароль',
    en: 'Confirm password',
    fr: 'Confirmer le mot de passe',
    ar: 'تأكيد كلمة المرور',
  },
  password_min_length: {
    ru: 'Пароль должен быть не короче 8 символов',
    en: 'Password must be at least 8 characters',
    fr: 'Le mot de passe doit contenir au moins 8 caractères',
    ar: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',
  },
  passwords_do_not_match: {
    ru: 'Пароли не совпадают',
    en: 'Passwords do not match',
    fr: 'Les mots de passe ne correspondent pas',
    ar: 'كلمتا المرور غير متطابقتين',
  },
  car_registration_partial_success: {
    ru: 'Регистрация прошла успешно, но автомобиль не был создан.',
    en: 'Registration was successful, but the car was not created.',
    fr: 'L inscription a reussi, mais la voiture n a pas ete creee.',
    ar: 'تم التسجيل بنجاح، ولكن لم يتم إنشاء السيارة.',
  },
  car_error_plate_busy: {
    ru: 'Этот номер автомобиля уже занят. Введите другой номер и сохраните данные еще раз.',
    en: 'This car plate number is already in use. Enter another number and save again.',
    fr: 'Ce numero de voiture est deja utilise. Saisissez un autre numero et enregistrez a nouveau.',
    ar: 'رقم السيارة هذا مستخدم بالفعل. أدخل رقما آخر واحفظ البيانات مرة أخرى.',
  },
  car_error_plate_invalid: {
    ru: 'Укажите корректный номер автомобиля.',
    en: 'Enter a valid car plate number.',
    fr: 'Saisissez un numero de voiture valide.',
    ar: 'أدخل رقم سيارة صحيحا.',
  },
  car_error_model_invalid: {
    ru: 'Выберите корректную модель автомобиля.',
    en: 'Select a valid car model.',
    fr: 'Selectionnez un modele de voiture valide.',
    ar: 'اختر طراز سيارة صحيحا.',
  },
  car_error_color_invalid: {
    ru: 'Выберите корректный цвет автомобиля.',
    en: 'Select a valid car color.',
    fr: 'Selectionnez une couleur de voiture valide.',
    ar: 'اختر لون سيارة صحيحا.',
  },
  car_error_photo_invalid: {
    ru: 'Загрузите корректное изображение автомобиля.',
    en: 'Upload a valid car image.',
    fr: 'Telechargez une image de voiture valide.',
    ar: 'حمل صورة سيارة صحيحة.',
  },
  car_error_details_invalid: {
    ru: 'Проверьте дополнительные данные автомобиля и сохраните еще раз.',
    en: 'Check the additional car details and save again.',
    fr: 'Verifiez les informations supplementaires de la voiture et enregistrez a nouveau.',
    ar: 'تحقق من بيانات السيارة الإضافية واحفظ مرة أخرى.',
  },
  car_error_class_invalid: {
    ru: 'Выберите корректный класс автомобиля.',
    en: 'Select a valid car class.',
    fr: 'Selectionnez une classe de voiture valide.',
    ar: 'اختر فئة سيارة صحيحة.',
  },
  car_error_seats_invalid: {
    ru: 'Укажите корректное количество мест.',
    en: 'Enter a valid number of seats.',
    fr: 'Saisissez un nombre de places valide.',
    ar: 'أدخل عدد مقاعد صحيحا.',
  },
  car_save_error: {
    ru: 'Автомобиль не был сохранен. Исправьте данные автомобиля и попробуйте еще раз.',
    en: 'The car was not saved. Fix the car details and try again.',
    fr: 'La voiture n a pas ete enregistree. Corrigez les informations et reessayez.',
    ar: 'لم يتم حفظ السيارة. صحح بيانات السيارة وحاول مرة أخرى.',
  },
  driver_not_approved: {
    ru: 'Ваш аккаунт водителя еще не подтвержден администратором. После проверки вы сможете брать заказы.',
    en: 'Your driver account has not been approved by an administrator yet. After approval, you will be able to take orders.',
    fr: 'Votre compte chauffeur n a pas encore ete approuve par un administrateur. Apres verification, vous pourrez prendre des commandes.',
    ar: 'لم تتم الموافقة على حساب السائق الخاص بك من قبل المسؤول بعد. بعد الموافقة، ستتمكن من قبول الطلبات.',
  },
  driver_status_active: {
    ru: 'Активен',
    en: 'Active',
    fr: 'Actif',
    ar: 'نشط',
  },
  driver_status_active_description: {
    ru: 'Готов к заказам',
    en: 'Ready for orders',
    fr: 'Pret pour les commandes',
    ar: 'جاهز للطلبات',
  },
  driver_status_inactive_with_car: {
    ru: 'Не в сети',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_status_inactive_with_car_description: {
    ru: 'Есть автомобиль',
    en: 'Car added',
    fr: 'Voiture ajoutee',
    ar: 'تمت إضافة السيارة',
  },
  driver_status_inactive_no_car: {
    ru: 'Не в сети',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_status_inactive_no_car_description: {
    ru: 'Нет автомобиля',
    en: 'No car added',
    fr: 'Aucune voiture ajoutee',
    ar: 'لم تتم إضافة سيارة',
  },

  driver_line_online: {
    ru: 'На линии',
    en: 'Online',
    fr: 'En ligne',
    ar: 'متصل',
  },
  driver_line_offline: {
    ru: 'Не на линии',
    en: 'Offline',
    fr: 'Hors ligne',
    ar: 'غير متصل',
  },
  driver_line_no_car: {
    ru: 'Авто не добавлено',
    en: 'No car added',
    fr: 'Voiture non ajoutee',
    ar: 'لم تتم إضافة سيارة',
  },
  driver_profile_activated_label: {
    ru: 'Профиль активирован',
    en: 'Profile activated',
    fr: 'Profil active',
    ar: 'تم تفعيل الملف الشخصي',
  },
  driver_profile_pending_label: {
    ru: 'Профиль на проверке',
    en: 'Profile pending',
    fr: 'Profil en verification',
    ar: 'الملف الشخصي قيد المراجعة',
  },
  driver_status_hint_add_car: {
    ru: 'Чтобы водитель мог выйти на линию, сначала нужно добавить автомобиль.',
    en: 'To go online, the driver must add a car first.',
    fr: 'Pour passer en ligne, le chauffeur doit d abord ajouter une voiture.',
    ar: 'لكي يصبح السائق متاحًا على الخط، يجب إضافة سيارة أولاً.',
  },
  driver_status_hint_profile_check: {
    ru: 'Чтобы водитель мог работать на линии, профиль должен пройти подтверждение.',
    en: 'To work online, the driver profile must be approved first.',
    fr: 'Pour travailler en ligne, le profil du chauffeur doit d abord etre approuve.',
    ar: 'لكي يعمل السائق على الخط، يجب اعتماد الملف الشخصي أولاً.',
  },
  driver_status_hint_header_change: {
    ru: 'Профиль подтвержден, доступность на линии можно менять из статуса в шапке приложения.',
    en: 'The profile is approved. Availability can be changed from the status control in the header.',
    fr: 'Le profil est approuve. La disponibilite peut etre modifiee depuis le statut dans l en-tete.',
    ar: 'تم اعتماد الملف الشخصي. يمكن تغيير التوفر من عنصر الحالة في رأس التطبيق.',
  },
  driver_status_need_car: {
    ru: 'Для выхода на линию сначала добавьте автомобиль.',
    en: 'Add a car first to go online.',
    fr: 'Ajoutez d abord une voiture pour passer en ligne.',
    ar: 'أضف سيارة أولاً لتصبح متاحًا على الخط.',
  },
  driver_status_need_approval: {
    ru: 'Изменение доступности доступно только подтвержденному водителю.',
    en: 'Availability can only be changed by an approved driver.',
    fr: 'La disponibilite ne peut etre modifiee que par un chauffeur approuve.',
    ar: 'لا يمكن تغيير التوفر إلا من قبل سائق معتمد.',
  },
  driver_status_updated_online: {
    ru: 'Статус обновлен: водитель на линии.',
    en: 'Status updated: the driver is online.',
    fr: 'Statut mis a jour : le chauffeur est en ligne.',
    ar: 'تم تحديث الحالة: السائق متاح على الخط.',
  },
  driver_status_updated_offline: {
    ru: 'Статус обновлен: водитель не на линии.',
    en: 'Status updated: the driver is offline.',
    fr: 'Statut mis a jour : le chauffeur est hors ligne.',
    ar: 'تم تحديث الحالة: السائق غير متاح على الخط.',
  },
  driver_status_change_failed: {
    ru: 'Не удалось изменить статус водителя',
    en: 'Could not change the driver status',
    fr: 'Impossible de changer le statut du chauffeur',
    ar: 'تعذر تغيير حالة السائق',
  },
  driver_voting_ready_action: {
    ru: 'Готов взять',
    en: 'Ready to take',
    fr: 'Pret a prendre',
    ar: 'جاهز للقبول',
  },
  driver_voting_ready_sent_description: {
    ru: 'Готовность водителя отмечена. Ожидайте выбора клиента.',
    en: 'The driver readiness has been noted. Wait for the customer to choose a driver.',
    fr: 'La disponibilite du chauffeur a ete notee. Attendez que le client choisisse un chauffeur.',
    ar: 'تم تسجيل جاهزية السائق. انتظر اختيار العميل للسائق.',
  },
  driver_voting_going_action: {
    ru: 'Еду на вызов',
    en: 'Going to the call',
    fr: 'Je vais a l appel',
    ar: 'أنا في الطريق إلى الطلب',
  },
  driver_voting_navigation: {
    ru: 'Навигация',
    en: 'Navigation',
    fr: 'Navigation',
    ar: 'الملاحة',
  },
  driver_voting_arrived: {
    ru: 'На месте',
    en: 'Arrived',
    fr: 'Sur place',
    ar: 'وصلت',
  },
  driver_voting_cancel_departure: {
    ru: 'Отменить выезд',
    en: 'Cancel departure',
    fr: 'Annuler le depart',
    ar: 'إلغاء الانطلاق',
  },
  driver_voting_waiting: {
    ru: 'Клиент ожидает',
    en: 'Customer is waiting',
    fr: 'Le client attend',
    ar: 'العميل ينتظر',
  },
  driver_voting_status_participating: {
    ru: 'Вы едете на вызов. Заказ пока не закреплен за вами.',
    en: 'You are going to the call. The order is not assigned to you yet.',
    fr: 'Vous allez a l appel. La commande ne vous est pas encore attribuee.',
    ar: 'أنت في الطريق إلى الطلب. لم يتم تعيين الطلب لك بعد.',
  },
  driver_voting_competitors: {
    ru: 'Конкуренты',
    en: 'Competitors',
    fr: 'Concurrents',
    ar: 'المنافسون',
  },
  driver_voting_nearest_competitor: {
    ru: 'Ближайший конкурент',
    en: 'Nearest competitor',
    fr: 'Concurrent le plus proche',
    ar: 'أقرب منافس',
  },
  driver_voting_nearest_competitors: {
    ru: 'Ближайшие',
    en: 'Nearest',
    fr: 'Les plus proches',
    ar: 'الأقرب',
  },
  driver_voting_ready_sent: {
    ru: 'Участие отмечено',
    en: 'Participation noted',
    fr: 'Participation notee',
    ar: 'تم تسجيل المشاركة',
  },
  driver_voting_cancelled: {
    ru: 'Выезд отменен',
    en: 'Departure cancelled',
    fr: 'Depart annule',
    ar: 'تم إلغاء الانطلاق',
  },
  driver_voting_arrived_sent: {
    ru: 'Клиенту отправлен сигнал, что водитель на месте.',
    en: 'The customer was notified that the driver has arrived.',
    fr: 'Le client a ete informe que le chauffeur est arrive.',
    ar: 'تم إشعار العميل بأن السائق وصل.',
  },
  driver_voting_confirm_code: {
    ru: 'Подтвердить код',
    en: 'Confirm code',
    fr: 'Confirmer le code',
    ar: 'تأكيد الرمز',
  },
  driver_voting_code_sent: {
    ru: 'Код отправлен на проверку.',
    en: 'The code was sent for verification.',
    fr: 'Le code a ete envoye pour verification.',
    ar: 'تم إرسال الرمز للتحقق.',
  },
  driver_voting_closed_by_other: {
    ru: 'Клиент уехал с другим водителем.',
    en: 'The customer left with another driver.',
    fr: 'Le client est parti avec un autre chauffeur.',
    ar: 'غادر العميل مع سائق آخر.',
  },
  driver_voting_closed_by_client: {
    ru: 'Клиент отменил ожидание.',
    en: 'The customer cancelled the waiting.',
    fr: 'Le client a annule l attente.',
    ar: 'ألغى العميل الانتظار.',
  },
  driver_voting_closed_timeout: {
    ru: 'Время ожидания истекло.',
    en: 'The waiting time has expired.',
    fr: 'Le temps d attente a expire.',
    ar: 'انتهى وقت الانتظار.',
  },
  driver_route_time: {
    ru: 'Примерно ехать',
    en: 'Estimated drive time',
    fr: 'Temps de trajet estime',
    ar: 'وقت الوصول التقريبي',
  },
  client_driver_arrived: {
    ru: 'Водитель на месте и ожидает вас.',
    en: 'The driver has arrived and is waiting for you.',
    fr: 'Le chauffeur est arrive et vous attend.',
    ar: 'وصل السائق وينتظرك.',
  },
  message_modal_success_title: {
    ru: 'Операция выполнена успешно',
    en: 'Operation completed successfully',
    fr: 'Operation terminee avec succes',
    ar: 'تمت العملية بنجاح',
  },
  message_modal_success_subtitle: {
    ru: 'Все данные были обработаны без ошибок.',
    en: 'All data was processed without errors.',
    fr: 'Toutes les donnees ont ete traitees sans erreur.',
    ar: 'تمت معالجة جميع البيانات بدون أخطاء.',
  },
  message_modal_success_info_title: {
    ru: 'Статус: Успешно',
    en: 'Status: Success',
    fr: 'Statut : Succes',
    ar: 'الحالة: نجاح',
  },
  message_modal_success_info_text: {
    ru: 'Изменения сохранены и уже применены в системе.',
    en: 'Changes have been saved and are already applied in the system.',
    fr: 'Les modifications ont ete enregistrees et appliquees dans le systeme.',
    ar: 'تم حفظ التغييرات وتطبيقها بالفعل في النظام.',
  },
  message_modal_next_steps: {
    ru: 'Что дальше?',
    en: 'What next?',
    fr: 'Quelle est la suite ?',
    ar: 'ما التالي؟',
  },
  message_modal_tip_continue: {
    ru: 'Проверьте результат и продолжайте работу',
    en: 'Check the result and continue working',
    fr: 'Verifiez le resultat et continuez',
    ar: 'تحقق من النتيجة وتابع العمل',
  },
  message_modal_tip_close_return: {
    ru: 'Если нужно — закройте окно и вернитесь к сценарию',
    en: 'If needed, close the window and return to the flow',
    fr: 'Si necessaire, fermez la fenetre et revenez au scenario',
    ar: 'إذا لزم الأمر، أغلق النافذة وعد إلى السيناريو',
  },
  message_modal_tip_auto_refresh: {
    ru: 'При повторной проверке статус обновится автоматически',
    en: 'On the next check, the status will update automatically',
    fr: 'Lors de la prochaine verification, le statut se mettra a jour automatiquement',
    ar: 'عند التحقق التالي، سيتم تحديث الحالة تلقائيًا',
  },
  message_modal_attention_title: {
    ru: 'Требуется дополнительное внимание',
    en: 'Additional attention required',
    fr: 'Attention supplementaire requise',
    ar: 'يتطلب الأمر انتباهًا إضافيًا',
  },
  message_modal_attention_subtitle: {
    ru: 'Система завершила проверку, но нашла данные, которые стоит перепроверить.',
    en: 'The system completed the check but found data that should be reviewed.',
    fr: 'Le systeme a termine la verification mais a trouve des donnees a reverifier.',
    ar: 'أكمل النظام التحقق لكنه وجد بيانات يجب مراجعتها.',
  },
  message_modal_warning_info_title: {
    ru: 'Статус: Предупреждение',
    en: 'Status: Warning',
    fr: 'Statut : Avertissement',
    ar: 'الحالة: تحذير',
  },
  message_modal_warning_info_text: {
    ru: 'Проверьте данные пользователя, чтобы избежать ошибок в работе.',
    en: 'Check the user data to avoid operational errors.',
    fr: 'Verifiez les donnees utilisateur pour eviter des erreurs.',
    ar: 'تحقق من بيانات المستخدم لتجنب الأخطاء أثناء العمل.',
  },
  message_modal_what_to_do: {
    ru: 'Что можно сделать?',
    en: 'What can be done?',
    fr: 'Que peut-on faire ?',
    ar: 'ما الذي يمكن فعله؟',
  },
  message_modal_tip_check_fields: {
    ru: 'Сверьте заполненные поля и прикрепленные данные',
    en: 'Check the filled fields and attached data',
    fr: 'Verifiez les champs remplis et les donnees jointes',
    ar: 'تحقق من الحقول المعبأة والبيانات المرفقة',
  },
  message_modal_tip_retry_after_fix: {
    ru: 'Повторите действие после исправления неточностей',
    en: 'Repeat the action after correcting inaccuracies',
    fr: 'Repetez l action apres avoir corrige les inexactitudes',
    ar: 'أعد الإجراء بعد تصحيح الأخطاء',
  },
  message_modal_tip_contact_support: {
    ru: 'Если предупреждение не исчезает — обратитесь в поддержку',
    en: 'If the warning persists, contact support',
    fr: 'Si l avertissement persiste, contactez le support',
    ar: 'إذا استمر التحذير، فاتصل بالدعم',
  },
  message_modal_fail_title: {
    ru: 'Обнаружена нештатная ситуация',
    en: 'An issue has been detected',
    fr: 'Une situation inhabituelle a ete detectee',
    ar: 'تم اكتشاف حالة غير متوقعة',
  },
  message_modal_fail_subtitle: {
    ru: 'Система выявила расхождение данных при проверке пользователя. Это может повлиять на корректность работы.',
    en: 'The system detected a data mismatch during user verification. This may affect correct operation.',
    fr: 'Le systeme a detecte une incoherence des donnees lors de la verification de l utilisateur.',
    ar: 'اكتشف النظام عدم تطابق في البيانات أثناء التحقق من المستخدم. قد يؤثر ذلك على صحة العمل.',
  },
  message_modal_error_code: {
    ru: 'Код ошибки',
    en: 'Error code',
    fr: 'Error code',
    ar: 'رمز الخطأ',
  },
  message_modal_error_details: {
    ru: 'Сведения об ошибке',
    en: 'Error details',
    fr: 'Details de l erreur',
    ar: 'تفاصيل الخطأ',
  },
  message_modal_fail_info_text: {
    ru: 'Состояние проверки пользователя не соответствует ожидаемому.',
    en: 'The user verification state does not match the expected one.',
    fr: 'L etat de verification de l utilisateur ne correspond pas a celui attendu.',
    ar: 'حالة التحقق من المستخدم لا تطابق الحالة المتوقعة.',
  },
  message_modal_tip_check_user_data: {
    ru: 'Проверьте актуальность данных пользователя',
    en: 'Check whether the user data is up to date',
    fr: 'Verifiez que les donnees utilisateur sont a jour',
    ar: 'تحقق من أن بيانات المستخدم محدثة',
  },
  message_modal_tip_refresh_or_retry: {
    ru: 'Повторите проверку или обновите страницу',
    en: 'Run the check again or refresh the page',
    fr: 'Relancez la verification ou actualisez la page',
    ar: 'أعد التحقق أو حدّث الصفحة',
  },
  message_modal_tip_if_repeat_support: {
    ru: 'Если проблема повторится — обратитесь в поддержку',
    en: 'If the problem repeats, contact support',
    fr: 'Si le probleme se repete, contactez le support',
    ar: 'إذا تكررت المشكلة، فاتصل بالدعم',
  },
  message_modal_done: {
    ru: 'Готово',
    en: 'Done',
    fr: 'Termine',
    ar: 'تم',
  },
  message_modal_retry: {
    ru: 'Повторить проверку',
    en: 'Retry check',
    fr: 'Relancer la verification',
    ar: 'إعادة التحقق',
  },
  message_modal_support: {
    ru: 'Связаться с поддержкой',
    en: 'Contact support',
    fr: 'Contacter le support',
    ar: 'الاتصال بالدعم',
  },
  message_modal_cancel: {
    ru: 'Отмена',
    en: 'Cancel',
    fr: 'Annuler',
    ar: 'إلغاء',
  },
  message_modal_close: {
    ru: 'Закрыть',
    en: 'Close',
    fr: 'Fermer',
    ar: 'إغلاق',
  },
  message_modal_fail_title_simple: {
    ru: 'Не удалось выполнить действие',
    en: 'Could not complete the action',
    fr: 'Impossible d effectuer l action',
    ar: 'تعذر تنفيذ الإجراء',
  },
  message_modal_warning_title_simple: {
    ru: 'Нужно внимание',
    en: 'Attention required',
    fr: 'Attention requise',
    ar: 'يتطلب الانتباه',
  },
  message_modal_reason_title: {
    ru: 'Причина',
    en: 'Reason',
    fr: 'Raison',
    ar: 'السبب',
  },
  message_modal_what_happened_title: {
    ru: 'Что произошло',
    en: 'What happened',
    fr: 'Ce qui s est passe',
    ar: 'ما الذي حدث',
  },
  message_modal_understood: {
    ru: 'Понятно',
    en: 'OK',
    fr: 'OK',
    ar: 'حسنا',
  },
  message_modal_already_actual: {
    ru: 'Данные уже актуальны. Повторное действие не требуется.',
    en: 'The data is already up to date. No repeated action is required.',
    fr: 'Les donnees sont deja a jour. Aucune action repetee n est requise.',
    ar: 'البيانات محدثة بالفعل. لا يلزم تكرار الإجراء.',
  },
  message_modal_warning_default_text: {
    ru: 'Сейчас это действие выполнить нельзя. Проверьте данные и попробуйте еще раз.',
    en: 'This action cannot be completed right now. Check the data and try again.',
    fr: 'Cette action ne peut pas etre effectuee pour le moment. Verifiez les donnees et reessayez.',
    ar: 'لا يمكن تنفيذ هذا الإجراء الآن. تحقق من البيانات وحاول مرة أخرى.',
  },
  message_modal_error_code_english: {
    ru: 'Error code',
    en: 'Error code',
    fr: 'Error code',
    ar: 'Error code',
  },
  api_error_generic: {
    ru: 'Не удалось выполнить действие. Проверьте данные и попробуйте еще раз.',
    en: 'The action could not be completed. Check the details and try again.',
    fr: 'L action n a pas pu etre effectuee. Verifiez les donnees et reessayez.',
    ar: 'تعذر تنفيذ الإجراء. تحقق من البيانات وحاول مرة أخرى.',
  },
  register_done_message: {
    ru: 'Регистрация прошла успешно.',
    en: 'Registration was successful.',
    fr: 'L inscription a reussi.',
    ar: 'تم التسجيل بنجاح.',
  },
  address_not_specified: {
    ru: 'Адрес не указан',
    en: 'Address not specified',
    fr: 'Adresse non indiquée',
    ar: 'العنوان غير محدد',
  },
  calculation_no_data: {
    ru: 'нет данных для расчёта',
    en: 'No calculation data',
    fr: 'Aucune donnée de calcul',
    ar: 'لا توجد بيانات للحساب',
  },
  driver_profit: {
    ru: 'Выгода водителя',
    en: 'Driver profit',
    fr: 'Gain du conducteur',
    ar: 'ربح السائق',
  },
  calculation: {
    ru: 'Расчёт',
    en: 'Calculation',
    fr: 'Calcul',
    ar: 'الحساب',
  },
  approximate_time: {
    ru: 'Ожидаемое время',
    en: 'Estimate time',
    fr: 'Temps estimé',
    ar: 'الوقت المقدر',
  },
  hint_privacy_policy: {
    ru: 'Политика конфиденциальности',
    en: 'Privacy policy',
    fr: 'Politique de confidentialité',
    ar: 'سياسة الخصوصية',
  },
  hint_submit: {
    ru: 'Подтвердить',
    en: 'Submit',
    fr: 'Envoyer',
    ar: 'إرسال',
  },
}

function getLanguageInfo() {
  try {
    return configSelectors.language(store.getState())
  } catch (error) {
    return undefined
  }
}

function getFallbackText(key: string, language?: { iso?: string, id?: string | number }) {
  const iso = language?.iso?.toLowerCase() || 'ru'
  const dictionary = FALLBACK_TRANSLATIONS[key]

  if (dictionary)
    return dictionary[iso] || dictionary.en || dictionary.ru

  return key
    .replace(/_p$/, '')
    .replace(/_/g, ' ')
    .replace(/^./, char => char.toUpperCase())
}

function applyOptions(result: string, options: IOptions) {
  if (options.toLower)
    return result.toLowerCase()

  if (options.toUpper)
    return result.toUpperCase()

  return result
}

/**
 * Gets localized text
 *
 * @param id CATEGORY.KEY or just KEY. Default category is lang_vls
 * @param options Result text modificators
 */
function t(id: string, options: IOptions = {}) {
  const language = getLanguageInfo()

  try {
    const splittedID = id.split('.')

    const category = splittedID.length === 2 ?
      splittedID[0] :
      CATEGORIES.LANG_VLS
    const key = splittedID[splittedID.length - 1]

    let result = ''

    const _data = (window as any).data

    if (!_data)
      return applyOptions(getFallbackText(key, language), options)

    const possibleCategories: string[] = Object.values(CATEGORIES)
    const languageId = language?.id
    const languageIso = language?.iso

    if (category === CATEGORIES.LANG_VLS) {
      const values = _data?.[category]?.[key]
      result = values?.[languageId as any] ||
        values?.[languageIso as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else if (category === CATEGORIES.BOOKING_DRIVER_STATES && key === '0') {
      const values = _data?.lang_vls?.search
      result = values?.[languageId as any] ||
        values?.[languageIso as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else if (possibleCategories.includes(category)) {
      const values = _data?.[category]?.[key]
      result = values?.[languageIso as any] ||
        values?.[languageId as any] ||
        values?.en ||
        values?.ru ||
        ''
    }
    else {
      throw new Error(`Unknown category ${category}`)
    }

    if (!result)
      result = getFallbackText(key, language)

    return applyOptions(result, options)
  } catch (error) {
    if (!errorsShown.has(id)) {
      console.warn(
        `Localization fallback used. id: ${id}, options: ${JSON.stringify(options)}`,
        error,
      )
      errorsShown.add(id)
    }

    const key = id.split('.').pop() || id
    return applyOptions(getFallbackText(key, language), options)
  }
}

// TODO get back

// const castedTranslation = T as any

export {
  t,
  TRANSLATION,
}

const errorsShown = new Set<string>()
