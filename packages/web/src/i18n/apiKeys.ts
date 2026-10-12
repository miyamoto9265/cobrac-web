import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the API key list on the settings page (one row per provider) and of the DeepSeek models (their API key
 * on the settings and admin pages, and the worker's notice about it), kept apart from the main catalogs and merged into
 * them in index.tsx. Every locale defines every key.
 */
export const apiKeysEn = {
  "keys.title": "API keys",
  "keys.help": "The API keys of each provider that jobs run with. Keys are stored encrypted with KMS and decrypted only while a job runs.",
  "keys.own": "Your own key (…{last4})",
  "keys.registered": "Registered (…{last4})",
  "keys.ready": "No key needed",
  "keys.needed": "Please register a key",
  "keys.askAdmin": "Please contact an admin",
  "keys.add": "Register",
  "deepseek.keyHelp": "Used to run jobs on the DeepSeek model (DeepSeek V4.1 Flash). Usage is billed to your DeepSeek account.",
  "deepseek.ownKeyHelp":
    "You can use the DeepSeek model without registering a key. Register your own key only if you want DeepSeek jobs to run on, and be billed to, your DeepSeek account. Deleting it switches back.",
  "deepseek.keySaved": "API key registered (checked with DeepSeek)",
  "deepseek.defaultKey": "Default DeepSeek API key",
  "deepseek.defaultKeyHelp":
    "The organization's DeepSeek API key, for the DeepSeek model. Approved users who have no DeepSeek key of their own run DeepSeek jobs with it (Tier 1 included). It belongs to no user account and is stored encrypted; after saving, only its last 4 characters and the date are shown.",
  "deepseek.defaultKeyConfirmDelete": "Delete the default DeepSeek API key? Approved users without their own DeepSeek key can no longer use the DeepSeek model.",
  "sys.noDeepseekKey": "No DeepSeek API key is registered, and an admin has not approved you.",
};

export type ApiKeysKey = keyof typeof apiKeysEn;

export const API_KEYS_CATALOG: Record<UiLocale, Record<ApiKeysKey, string>> = {
  en: apiKeysEn,
  ja: {
    "keys.title": "API キー",
    "keys.help": "ジョブの実行に使う各社の API キーです。キーは KMS で暗号化して保存し、ジョブの実行中だけ復号します。",
    "keys.own": "自分のキー（…{last4}）",
    "keys.registered": "登録済み（…{last4}）",
    "keys.ready": "登録は不要です",
    "keys.needed": "キーを登録してください",
    "keys.askAdmin": "管理者にお問い合わせください",
    "keys.add": "登録",
    "deepseek.keyHelp": "DeepSeek のモデル（DeepSeek V4.1 Flash）でジョブを実行するときに使います。利用料金はご自身の DeepSeek アカウントに請求されます。",
    "deepseek.ownKeyHelp":
      "キーを登録しなくても DeepSeek のモデルを使えます。ご自身の DeepSeek アカウントで実行・請求したい場合だけ登録してください。削除すると元に戻ります。",
    "deepseek.keySaved": "API キーを登録しました（DeepSeek への疎通確認済み）",
    "deepseek.defaultKey": "デフォルトの DeepSeek API キー",
    "deepseek.defaultKeyHelp":
      "組織の DeepSeek API キーで、DeepSeek のモデルに使います。承認したユーザーのうち自分の DeepSeek キーを登録していない人は、このキーで DeepSeek のジョブを実行します（Tier 1 も利用できます）。どのユーザーのアカウントにも属さず、暗号化して保存します。保存後に表示するのは末尾 4 文字と日付だけです。",
    "deepseek.defaultKeyConfirmDelete": "デフォルトの DeepSeek API キーを削除しますか？自分の DeepSeek キーを持たない承認済みユーザーは DeepSeek のモデルを使えなくなります。",
    "sys.noDeepseekKey": "DeepSeek API キーが未登録で、管理者による利用の承認もありません。",
  },
  zh: {
    "keys.title": "API 密钥",
    "keys.help": "运行任务所用的各提供商 API 密钥。密钥经 KMS 加密保存，仅在任务运行时解密。",
    "keys.own": "自己的密钥（…{last4}）",
    "keys.registered": "已登记（…{last4}）",
    "keys.ready": "无需登记",
    "keys.needed": "请登记密钥",
    "keys.askAdmin": "请联系管理员",
    "keys.add": "登记",
    "deepseek.keyHelp": "用于在 DeepSeek 模型（DeepSeek V4.1 Flash）上运行任务。费用计入您的 DeepSeek 账户。",
    "deepseek.ownKeyHelp": "无需登记密钥即可使用 DeepSeek 模型。只有希望以自己的 DeepSeek 账户运行并计费时，才需登记自己的密钥。删除后恢复原状。",
    "deepseek.keySaved": "已登记 API 密钥（已与 DeepSeek 确认连通）",
    "deepseek.defaultKey": "默认 DeepSeek API 密钥",
    "deepseek.defaultKeyHelp":
      "组织的 DeepSeek API 密钥，用于 DeepSeek 模型。已获批准但未登记自己 DeepSeek 密钥的用户用此密钥运行 DeepSeek 任务（Tier 1 也可使用）。它不属于任何用户账户，加密保存；保存后仅显示末尾 4 个字符和日期。",
    "deepseek.defaultKeyConfirmDelete": "删除默认 DeepSeek API 密钥？没有自己 DeepSeek 密钥的已批准用户将无法使用 DeepSeek 模型。",
    "sys.noDeepseekKey": "未登记 DeepSeek API 密钥，且管理员尚未批准您使用。",
  },
  zhTw: {
    "keys.title": "API 金鑰",
    "keys.help": "執行工作所用的各供應商 API 金鑰。金鑰經 KMS 加密儲存，僅在工作執行時解密。",
    "keys.own": "自己的金鑰（…{last4}）",
    "keys.registered": "已登錄（…{last4}）",
    "keys.ready": "無需登錄",
    "keys.needed": "請登錄金鑰",
    "keys.askAdmin": "請聯絡管理員",
    "keys.add": "登錄",
    "deepseek.keyHelp": "用於在 DeepSeek 模型（DeepSeek V4.1 Flash）上執行工作。費用計入您的 DeepSeek 帳戶。",
    "deepseek.ownKeyHelp": "不登錄金鑰也能使用 DeepSeek 模型。只有想以自己的 DeepSeek 帳戶執行並計費時，才需登錄自己的金鑰。刪除後即恢復原狀。",
    "deepseek.keySaved": "已登錄 API 金鑰（已與 DeepSeek 確認連線）",
    "deepseek.defaultKey": "預設 DeepSeek API 金鑰",
    "deepseek.defaultKeyHelp":
      "組織的 DeepSeek API 金鑰，用於 DeepSeek 模型。已獲核准但未登錄自己 DeepSeek 金鑰的使用者以此金鑰執行 DeepSeek 工作（Tier 1 也可使用）。它不屬於任何使用者帳戶，加密儲存；儲存後僅顯示末尾 4 個字元與日期。",
    "deepseek.defaultKeyConfirmDelete": "刪除預設 DeepSeek API 金鑰？沒有自己 DeepSeek 金鑰的已核准使用者將無法使用 DeepSeek 模型。",
    "sys.noDeepseekKey": "未登錄 DeepSeek API 金鑰，且管理員尚未核准您使用。",
  },
  ko: {
    "keys.title": "API 키",
    "keys.help": "작업 실행에 쓰는 각 제공사의 API 키입니다. 키는 KMS로 암호화해 저장되며 작업 실행 중에만 복호화됩니다.",
    "keys.own": "내 키 (…{last4})",
    "keys.registered": "등록됨 (…{last4})",
    "keys.ready": "등록하지 않아도 됩니다",
    "keys.needed": "키를 등록해 주세요",
    "keys.askAdmin": "관리자에게 문의해 주세요",
    "keys.add": "등록",
    "deepseek.keyHelp": "DeepSeek 모델(DeepSeek V4.1 Flash)로 작업을 실행할 때 사용합니다. 요금은 사용자의 DeepSeek 계정에 청구됩니다.",
    "deepseek.ownKeyHelp": "키를 등록하지 않아도 DeepSeek 모델을 사용할 수 있습니다. 내 DeepSeek 계정으로 실행·청구하려는 경우에만 등록하세요. 삭제하면 원래대로 돌아갑니다.",
    "deepseek.keySaved": "API 키를 등록했습니다 (DeepSeek 연결 확인 완료)",
    "deepseek.defaultKey": "기본 DeepSeek API 키",
    "deepseek.defaultKeyHelp":
      "조직의 DeepSeek API 키로, DeepSeek 모델에 사용합니다. 승인된 사용자 중 자신의 DeepSeek 키가 없는 사람은 이 키로 DeepSeek 작업을 실행합니다(Tier 1도 사용 가능). 어느 사용자 계정에도 속하지 않으며 암호화해 저장합니다. 저장 후에는 끝 4자리와 날짜만 표시합니다.",
    "deepseek.defaultKeyConfirmDelete": "기본 DeepSeek API 키를 삭제할까요? 자신의 DeepSeek 키가 없는 승인된 사용자는 DeepSeek 모델을 사용할 수 없게 됩니다.",
    "sys.noDeepseekKey": "DeepSeek API 키가 등록되어 있지 않고, 관리자의 사용 승인도 없습니다.",
  },
  de: {
    "keys.title": "API-Schlüssel",
    "keys.help": "Die API-Schlüssel der Anbieter, mit denen Jobs laufen. Schlüssel werden mit KMS verschlüsselt gespeichert und nur während eines Jobs entschlüsselt.",
    "keys.own": "Eigener Schlüssel (…{last4})",
    "keys.registered": "Registriert (…{last4})",
    "keys.ready": "Kein Schlüssel nötig",
    "keys.needed": "Bitte Schlüssel hinterlegen",
    "keys.askAdmin": "Bitte wenden Sie sich an einen Admin",
    "keys.add": "Hinterlegen",
    "deepseek.keyHelp": "Wird verwendet, um Jobs mit dem DeepSeek-Modell (DeepSeek V4.1 Flash) auszuführen. Die Kosten werden Ihrem DeepSeek-Konto berechnet.",
    "deepseek.ownKeyHelp":
      "Sie können das DeepSeek-Modell ohne eigenen Schlüssel nutzen. Hinterlegen Sie Ihren Schlüssel nur, wenn DeepSeek-Jobs über Ihr DeepSeek-Konto laufen und abgerechnet werden sollen. Nach dem Löschen gilt wieder die vorherige Einstellung.",
    "deepseek.keySaved": "API-Schlüssel gespeichert (bei DeepSeek geprüft)",
    "deepseek.defaultKey": "Standard-DeepSeek-API-Schlüssel",
    "deepseek.defaultKeyHelp":
      "Der DeepSeek-API-Schlüssel der Organisation für das DeepSeek-Modell. Freigegebene Nutzer ohne eigenen DeepSeek-Schlüssel führen DeepSeek-Jobs damit aus (auch in Tier 1). Er gehört zu keinem Nutzerkonto und wird verschlüsselt gespeichert; nach dem Speichern werden nur die letzten 4 Zeichen und das Datum angezeigt.",
    "deepseek.defaultKeyConfirmDelete": "Standard-DeepSeek-API-Schlüssel löschen? Freigegebene Nutzer ohne eigenen DeepSeek-Schlüssel können das DeepSeek-Modell dann nicht mehr nutzen.",
    "sys.noDeepseekKey": "Es ist kein DeepSeek-API-Schlüssel hinterlegt, und ein Admin hat Sie nicht freigegeben.",
  },
  fr: {
    "keys.title": "Clés API",
    "keys.help": "Les clés API de chaque fournisseur avec lesquelles les tâches s'exécutent. Elles sont chiffrées avec KMS et ne sont déchiffrées que pendant l'exécution d'une tâche.",
    "keys.own": "Votre propre clé (…{last4})",
    "keys.registered": "Enregistrée (…{last4})",
    "keys.ready": "Aucune clé nécessaire",
    "keys.needed": "Veuillez enregistrer une clé",
    "keys.askAdmin": "Veuillez contacter un administrateur",
    "keys.add": "Enregistrer",
    "deepseek.keyHelp": "Sert à exécuter des tâches avec le modèle DeepSeek (DeepSeek V4.1 Flash). Les frais sont facturés à votre compte DeepSeek.",
    "deepseek.ownKeyHelp":
      "Vous pouvez utiliser le modèle DeepSeek sans enregistrer de clé. N'enregistrez votre clé que si vous voulez que les tâches DeepSeek s'exécutent et soient facturées sur votre compte DeepSeek. La supprimer rétablit le fonctionnement précédent.",
    "deepseek.keySaved": "Clé API enregistrée (vérifiée auprès de DeepSeek)",
    "deepseek.defaultKey": "Clé API DeepSeek par défaut",
    "deepseek.defaultKeyHelp":
      "La clé API DeepSeek de l'organisation, pour le modèle DeepSeek. Les utilisateurs approuvés sans clé DeepSeek personnelle exécutent les tâches DeepSeek avec elle (Tier 1 compris). Elle n'appartient à aucun compte utilisateur et est stockée chiffrée ; après l'enregistrement, seuls ses 4 derniers caractères et la date sont affichés.",
    "deepseek.defaultKeyConfirmDelete": "Supprimer la clé API DeepSeek par défaut ? Les utilisateurs approuvés sans clé DeepSeek personnelle ne pourront plus utiliser le modèle DeepSeek.",
    "sys.noDeepseekKey": "Aucune clé API DeepSeek n'est enregistrée et aucun administrateur ne vous a approuvé.",
  },
  es: {
    "keys.title": "Claves de API",
    "keys.help": "Las claves de API de cada proveedor con las que se ejecutan los trabajos. Se guardan cifradas con KMS y solo se descifran mientras corre un trabajo.",
    "keys.own": "Tu propia clave (…{last4})",
    "keys.registered": "Registrada (…{last4})",
    "keys.ready": "No necesitas una clave",
    "keys.needed": "Registra una clave",
    "keys.askAdmin": "Consulta a un administrador",
    "keys.add": "Registrar",
    "deepseek.keyHelp": "Se usa para ejecutar trabajos con el modelo de DeepSeek (DeepSeek V4.1 Flash). El uso se cobra en tu cuenta de DeepSeek.",
    "deepseek.ownKeyHelp":
      "Puedes usar el modelo de DeepSeek sin registrar una clave. Registra tu propia clave solo si quieres que los trabajos de DeepSeek se ejecuten y se cobren en tu cuenta de DeepSeek. Elimínala para volver atrás.",
    "deepseek.keySaved": "Clave de API registrada (verificada con DeepSeek)",
    "deepseek.defaultKey": "Clave de API de DeepSeek predeterminada",
    "deepseek.defaultKeyHelp":
      "La clave de API de DeepSeek de la organización, para el modelo de DeepSeek. Los usuarios aprobados sin clave de DeepSeek propia ejecutan con ella los trabajos de DeepSeek (Tier 1 incluido). No pertenece a ninguna cuenta de usuario y se guarda cifrada; después de guardarla, solo se muestran sus 4 últimos caracteres y la fecha.",
    "deepseek.defaultKeyConfirmDelete": "¿Eliminar la clave de API de DeepSeek predeterminada? Los usuarios aprobados sin clave de DeepSeek propia ya no podrán usar el modelo de DeepSeek.",
    "sys.noDeepseekKey": "No hay una clave de API de DeepSeek registrada y ningún administrador te ha aprobado.",
  },
  pt: {
    "keys.title": "Chaves de API",
    "keys.help": "As chaves de API de cada provedor com que os trabalhos são executados. Elas são guardadas criptografadas com KMS e só são descriptografadas durante um trabalho.",
    "keys.own": "Sua própria chave (…{last4})",
    "keys.registered": "Registrada (…{last4})",
    "keys.ready": "Nenhuma chave necessária",
    "keys.needed": "Registre uma chave",
    "keys.askAdmin": "Fale com um administrador",
    "keys.add": "Registrar",
    "deepseek.keyHelp": "Usada para executar trabalhos com o modelo da DeepSeek (DeepSeek V4.1 Flash). O uso é cobrado na sua conta da DeepSeek.",
    "deepseek.ownKeyHelp":
      "Você pode usar o modelo da DeepSeek sem registrar uma chave. Registre sua própria chave apenas se quiser que os trabalhos da DeepSeek sejam executados e cobrados na sua conta da DeepSeek. Excluí-la volta ao funcionamento anterior.",
    "deepseek.keySaved": "Chave de API registrada (verificada com a DeepSeek)",
    "deepseek.defaultKey": "Chave de API da DeepSeek padrão",
    "deepseek.defaultKeyHelp":
      "A chave de API da DeepSeek da organização, para o modelo da DeepSeek. Usuários aprovados sem chave da DeepSeek própria executam com ela os trabalhos da DeepSeek (Tier 1 incluído). Ela não pertence a nenhuma conta de usuário e é guardada criptografada; depois de salva, só os 4 últimos caracteres e a data são exibidos.",
    "deepseek.defaultKeyConfirmDelete": "Excluir a chave de API da DeepSeek padrão? Usuários aprovados sem chave da DeepSeek própria não poderão mais usar o modelo da DeepSeek.",
    "sys.noDeepseekKey": "Nenhuma chave de API da DeepSeek está registrada, e nenhum administrador aprovou você.",
  },
  ru: {
    "keys.title": "API-ключи",
    "keys.help": "API-ключи провайдеров, с которыми выполняются задачи. Ключи хранятся зашифрованными с помощью KMS и расшифровываются только во время выполнения задачи.",
    "keys.own": "Ваш ключ (…{last4})",
    "keys.registered": "Зарегистрирован (…{last4})",
    "keys.ready": "Ключ не нужен",
    "keys.needed": "Зарегистрируйте ключ",
    "keys.askAdmin": "Обратитесь к администратору",
    "keys.add": "Зарегистрировать",
    "deepseek.keyHelp": "Используется для выполнения задач на модели DeepSeek (DeepSeek V4.1 Flash). Оплата списывается с вашего аккаунта DeepSeek.",
    "deepseek.ownKeyHelp":
      "Модель DeepSeek можно использовать без регистрации ключа. Регистрируйте свой ключ, только если хотите, чтобы задачи DeepSeek выполнялись и оплачивались через ваш аккаунт DeepSeek. После удаления всё вернётся как было.",
    "deepseek.keySaved": "API-ключ зарегистрирован (проверен в DeepSeek)",
    "deepseek.defaultKey": "API-ключ DeepSeek по умолчанию",
    "deepseek.defaultKeyHelp":
      "API-ключ DeepSeek организации для модели DeepSeek. Одобренные пользователи без собственного ключа DeepSeek выполняют с ним задачи DeepSeek (в том числе в Tier 1). Он не принадлежит ни одному аккаунту пользователя и хранится зашифрованным; после сохранения показываются только последние 4 символа и дата.",
    "deepseek.defaultKeyConfirmDelete": "Удалить API-ключ DeepSeek по умолчанию? Одобренные пользователи без собственного ключа DeepSeek больше не смогут использовать модель DeepSeek.",
    "sys.noDeepseekKey": "API-ключ DeepSeek не зарегистрирован, и администратор вас не одобрил.",
  },
};
