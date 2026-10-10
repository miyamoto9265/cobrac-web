import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the Claude models (the Anthropic API key on the settings and admin pages, and the worker's notices
 * about it), kept apart from the main catalogs and merged into them in index.tsx. Every locale defines every key.
 */
export const claudeEn = {
  "claude.key": "Anthropic API key",
  "claude.keyHelp":
    "Used to run jobs on the Claude models. The key is stored encrypted with KMS and decrypted only while a job runs. Usage is billed to your Anthropic account.",
  "claude.ownKey": "Your own Anthropic API key (optional)",
  "claude.ownKeyHelp":
    "You can use the Claude models without registering a key. Register your own key only if you want the Claude jobs to run on and be billed to your Anthropic account. The key is stored encrypted with KMS and decrypted only while a job runs. Deleting it switches back.",
  "claude.ownKeyActive": "Claude jobs run with your own key (…{last4}). Usage is billed to your Anthropic account.",
  "claude.ready": "No key needed. You can choose the Claude models as they are.",
  "claude.unavailable": "The Claude models are not available right now. Please contact an admin.",
  "claude.keySaved": "API key registered (checked with Anthropic)",
  "claude.defaultKey": "Default Anthropic API key",
  "claude.defaultKeyHelp":
    "The organization's Anthropic API key, for the Claude models. Approved users who have no Anthropic key of their own run Claude jobs with it, within their tier (Tier 1: Claude Haiku 5.5 only). It belongs to no user account and is stored encrypted; after saving, only its last 4 characters and the date are shown.",
  "claude.workspace": "Workspace ID (optional)",
  "claude.workspaceHelp": "Only for a key that is not tied to one workspace (a user key). Enter the ID of the Anthropic workspace that jobs run in (wrkspc_…). Keys made in a workspace of the Anthropic Console do not need it.",
  "claude.defaultKeyConfirmDelete": "Delete the default Anthropic API key? Approved users without their own Anthropic key can no longer run the Claude models.",
  "sys.noAnthropicKey": "No Anthropic API key is registered, and an admin has not approved you.",
  "sys.newThreadProvider": "The model now runs on another provider; continuing on a new thread.",
};

export type ClaudeKey = keyof typeof claudeEn;

export const CLAUDE_CATALOG: Record<UiLocale, Record<ClaudeKey, string>> = {
  en: claudeEn,
  ja: {
    "claude.key": "Anthropic API キー",
    "claude.keyHelp": "Claude のモデルでジョブを実行するときに使います。キーは KMS で暗号化して保存され、ジョブ実行時にのみ復号されます。利用料金はあなたの Anthropic アカウントに請求されます。",
    "claude.ownKey": "自分の Anthropic API キー（任意）",
    "claude.ownKeyHelp":
      "キーを登録しなくても Claude のモデルを使えます。自分の Anthropic アカウントで実行・請求したい場合だけ、自分のキーを登録してください。キーは KMS で暗号化して保存され、ジョブ実行時にのみ復号されます。削除すると元に戻ります。",
    "claude.ownKeyActive": "Claude のジョブは自分のキー（末尾 …{last4}）で実行しています。利用料金はあなたの Anthropic アカウントに請求されます。",
    "claude.ready": "登録は不要です。Claude のモデルもそのまま選べます。",
    "claude.unavailable": "Claude のモデルはいまは使えません。管理者に連絡してください。",
    "claude.keySaved": "API キーを登録しました（Anthropic への疎通確認済み）",
    "claude.defaultKey": "デフォルトの Anthropic API キー",
    "claude.defaultKeyHelp":
      "組織の Anthropic API キーで、Claude のモデルに使います。承認したユーザーのうち自分の Anthropic キーを登録していない人は、Tier の範囲で（Tier 1 は Claude Haiku 5.5 だけ）このキーで Claude のジョブを実行します。どのユーザーのアカウントにも属さず、暗号化して保存します。保存後に表示するのは末尾 4 文字と日付だけです。",
    "claude.workspace": "ワークスペース ID（任意）",
    "claude.workspaceHelp": "ワークスペースに紐づかないキー（ユーザーキー）のときだけ、ジョブを実行する Anthropic のワークスペースの ID（wrkspc_…）を入力してください。Anthropic Console のワークスペースで発行したキーには不要です。",
    "claude.defaultKeyConfirmDelete": "デフォルトの Anthropic API キーを削除しますか？自分の Anthropic キーを持たない承認済みユーザーは Claude のモデルを使えなくなります。",
    "sys.noAnthropicKey": "Anthropic API キーが未登録で、管理者による利用の承認もありません。",
    "sys.newThreadProvider": "モデルの提供元が変わったため、新しいスレッドで続けます。",
  },
  zh: {
    "claude.key": "Anthropic API 密钥",
    "claude.keyHelp": "用于在 Claude 模型上运行任务。密钥经 KMS 加密保存，仅在任务运行时解密。费用计入您的 Anthropic 账户。",
    "claude.ownKey": "自己的 Anthropic API 密钥（可选）",
    "claude.ownKeyHelp": "无需登记密钥即可使用 Claude 模型。只有希望以自己的 Anthropic 账户运行并计费时，才需登记自己的密钥。密钥经 KMS 加密保存，仅在任务运行时解密。删除后恢复原状。",
    "claude.ownKeyActive": "Claude 任务正在使用您自己的密钥（末尾 …{last4}）运行。费用计入您的 Anthropic 账户。",
    "claude.ready": "无需登记。可直接选择 Claude 模型。",
    "claude.unavailable": "目前无法使用 Claude 模型。请联系管理员。",
    "claude.keySaved": "已登记 API 密钥（已与 Anthropic 确认连通）",
    "claude.defaultKey": "默认 Anthropic API 密钥",
    "claude.defaultKeyHelp":
      "组织的 Anthropic API 密钥，用于 Claude 模型。已获批准但未登记自己 Anthropic 密钥的用户，在其 Tier 范围内（Tier 1 仅限 Claude Haiku 5.5）用此密钥运行 Claude 任务。它不属于任何用户账户，加密保存；保存后仅显示末尾 4 个字符和日期。",
    "claude.workspace": "工作区 ID（可选）",
    "claude.workspaceHelp": "仅当密钥未绑定到某个工作区（用户密钥）时，请输入运行工作的 Anthropic 工作区 ID（wrkspc_…）。在 Anthropic Console 的工作区中创建的密钥无需填写。",
    "claude.defaultKeyConfirmDelete": "删除默认 Anthropic API 密钥？没有自己 Anthropic 密钥的已批准用户将无法使用 Claude 模型。",
    "sys.noAnthropicKey": "未登记 Anthropic API 密钥，且管理员尚未批准您使用。",
    "sys.newThreadProvider": "模型的提供方已变更，将在新线程中继续。",
  },
  zhTw: {
    "claude.key": "Anthropic API 金鑰",
    "claude.keyHelp": "用於在 Claude 模型上執行工作。金鑰經 KMS 加密儲存，僅在工作執行時解密。費用計入您的 Anthropic 帳戶。",
    "claude.ownKey": "自己的 Anthropic API 金鑰（選填）",
    "claude.ownKeyHelp": "不登錄金鑰也能使用 Claude 模型。只有想以自己的 Anthropic 帳戶執行並計費時，才需登錄自己的金鑰。金鑰經 KMS 加密儲存，僅在工作執行時解密。刪除後即恢復原狀。",
    "claude.ownKeyActive": "Claude 工作正以您自己的金鑰（末尾 …{last4}）執行。費用計入您的 Anthropic 帳戶。",
    "claude.ready": "無需登錄。可直接選擇 Claude 模型。",
    "claude.unavailable": "目前無法使用 Claude 模型。請聯絡管理員。",
    "claude.keySaved": "已登錄 API 金鑰（已與 Anthropic 確認連線）",
    "claude.defaultKey": "預設 Anthropic API 金鑰",
    "claude.defaultKeyHelp":
      "組織的 Anthropic API 金鑰，用於 Claude 模型。已獲核准但未登錄自己 Anthropic 金鑰的使用者，在其 Tier 範圍內（Tier 1 僅限 Claude Haiku 5.5）以此金鑰執行 Claude 工作。它不屬於任何使用者帳戶，加密儲存；儲存後僅顯示末尾 4 個字元與日期。",
    "claude.workspace": "工作區 ID（選填）",
    "claude.workspaceHelp": "僅當金鑰未綁定至某個工作區（使用者金鑰）時，請輸入執行工作的 Anthropic 工作區 ID（wrkspc_…）。在 Anthropic Console 的工作區中建立的金鑰無需填寫。",
    "claude.defaultKeyConfirmDelete": "刪除預設 Anthropic API 金鑰？沒有自己 Anthropic 金鑰的已核准使用者將無法使用 Claude 模型。",
    "sys.noAnthropicKey": "未登錄 Anthropic API 金鑰，且管理員尚未核准您使用。",
    "sys.newThreadProvider": "模型的提供者已變更，將在新執行緒中繼續。",
  },
  ko: {
    "claude.key": "Anthropic API 키",
    "claude.keyHelp": "Claude 모델로 작업을 실행할 때 사용합니다. 키는 KMS로 암호화해 저장되며 작업 실행 중에만 복호화됩니다. 요금은 사용자의 Anthropic 계정에 청구됩니다.",
    "claude.ownKey": "내 Anthropic API 키 (선택)",
    "claude.ownKeyHelp": "키를 등록하지 않아도 Claude 모델을 사용할 수 있습니다. 내 Anthropic 계정으로 실행·청구하려는 경우에만 내 키를 등록하세요. 키는 KMS로 암호화해 저장되며 작업 실행 중에만 복호화됩니다. 삭제하면 원래대로 돌아갑니다.",
    "claude.ownKeyActive": "Claude 작업은 내 키(끝자리 …{last4})로 실행 중입니다. 요금은 사용자의 Anthropic 계정에 청구됩니다.",
    "claude.ready": "등록할 필요가 없습니다. Claude 모델도 그대로 선택할 수 있습니다.",
    "claude.unavailable": "지금은 Claude 모델을 사용할 수 없습니다. 관리자에게 문의하세요.",
    "claude.keySaved": "API 키를 등록했습니다 (Anthropic 연결 확인 완료)",
    "claude.defaultKey": "기본 Anthropic API 키",
    "claude.defaultKeyHelp":
      "조직의 Anthropic API 키로, Claude 모델에 사용합니다. 승인된 사용자 중 자신의 Anthropic 키가 없는 사람은 Tier 범위 안에서(Tier 1은 Claude Haiku 5.5만) 이 키로 Claude 작업을 실행합니다. 어느 사용자 계정에도 속하지 않으며 암호화해 저장합니다. 저장 후에는 끝 4자리와 날짜만 표시합니다.",
    "claude.workspace": "워크스페이스 ID(선택)",
    "claude.workspaceHelp": "워크스페이스에 연결되지 않은 키(사용자 키)일 때만, 작업을 실행할 Anthropic 워크스페이스의 ID(wrkspc_…)를 입력해 주세요. Anthropic Console의 워크스페이스에서 발급한 키에는 필요하지 않습니다.",
    "claude.defaultKeyConfirmDelete": "기본 Anthropic API 키를 삭제할까요? 자신의 Anthropic 키가 없는 승인된 사용자는 Claude 모델을 사용할 수 없게 됩니다.",
    "sys.noAnthropicKey": "Anthropic API 키가 등록되어 있지 않고, 관리자의 사용 승인도 없습니다.",
    "sys.newThreadProvider": "모델 제공사가 바뀌어 새 스레드에서 계속합니다.",
  },
  de: {
    "claude.key": "Anthropic-API-Schlüssel",
    "claude.keyHelp":
      "Wird verwendet, um Jobs mit den Claude-Modellen auszuführen. Der Schlüssel wird mit KMS verschlüsselt gespeichert und nur während eines Jobs entschlüsselt. Die Kosten werden Ihrem Anthropic-Konto berechnet.",
    "claude.ownKey": "Eigener Anthropic-API-Schlüssel (optional)",
    "claude.ownKeyHelp":
      "Sie können die Claude-Modelle ohne eigenen Schlüssel nutzen. Hinterlegen Sie Ihren Schlüssel nur, wenn Claude-Jobs über Ihr Anthropic-Konto laufen und abgerechnet werden sollen. Der Schlüssel wird mit KMS verschlüsselt gespeichert und nur während eines Jobs entschlüsselt. Nach dem Löschen gilt wieder die vorherige Einstellung.",
    "claude.ownKeyActive": "Claude-Jobs laufen mit Ihrem eigenen Schlüssel (…{last4}). Die Kosten werden Ihrem Anthropic-Konto berechnet.",
    "claude.ready": "Kein Schlüssel nötig. Sie können die Claude-Modelle direkt wählen.",
    "claude.unavailable": "Die Claude-Modelle sind derzeit nicht verfügbar. Bitte wenden Sie sich an einen Admin.",
    "claude.keySaved": "API-Schlüssel gespeichert (bei Anthropic geprüft)",
    "claude.defaultKey": "Standard-Anthropic-API-Schlüssel",
    "claude.defaultKeyHelp":
      "Der Anthropic-API-Schlüssel der Organisation für die Claude-Modelle. Freigegebene Nutzer ohne eigenen Anthropic-Schlüssel führen Claude-Jobs im Rahmen ihres Tiers damit aus (Tier 1: nur Claude Haiku 5.5). Er gehört zu keinem Nutzerkonto und wird verschlüsselt gespeichert; nach dem Speichern werden nur die letzten 4 Zeichen und das Datum angezeigt.",
    "claude.workspace": "Workspace-ID (optional)",
    "claude.workspaceHelp": "Nur für einen Schlüssel, der an keinen Workspace gebunden ist (Nutzerschlüssel): die ID des Anthropic-Workspace, in dem Jobs laufen (wrkspc_…). Schlüssel aus einem Workspace der Anthropic Console brauchen sie nicht.",
    "claude.defaultKeyConfirmDelete": "Standard-Anthropic-API-Schlüssel löschen? Freigegebene Nutzer ohne eigenen Anthropic-Schlüssel können die Claude-Modelle dann nicht mehr nutzen.",
    "sys.noAnthropicKey": "Es ist kein Anthropic-API-Schlüssel hinterlegt, und ein Admin hat Sie nicht freigegeben.",
    "sys.newThreadProvider": "Das Modell läuft jetzt bei einem anderen Anbieter; es geht in einem neuen Thread weiter.",
  },
  fr: {
    "claude.key": "Clé API Anthropic",
    "claude.keyHelp":
      "Sert à exécuter des tâches avec les modèles Claude. La clé est chiffrée avec KMS et n'est déchiffrée que pendant l'exécution d'une tâche. Les frais sont facturés à votre compte Anthropic.",
    "claude.ownKey": "Votre propre clé API Anthropic (facultatif)",
    "claude.ownKeyHelp":
      "Vous pouvez utiliser les modèles Claude sans enregistrer de clé. N'enregistrez votre clé que si vous voulez que les tâches Claude s'exécutent et soient facturées sur votre compte Anthropic. La clé est chiffrée avec KMS et n'est déchiffrée que pendant l'exécution d'une tâche. La supprimer rétablit le fonctionnement précédent.",
    "claude.ownKeyActive": "Les tâches Claude s'exécutent avec votre propre clé (…{last4}). Les frais sont facturés à votre compte Anthropic.",
    "claude.ready": "Aucune clé nécessaire. Vous pouvez choisir directement les modèles Claude.",
    "claude.unavailable": "Les modèles Claude ne sont pas disponibles pour le moment. Veuillez contacter un administrateur.",
    "claude.keySaved": "Clé API enregistrée (vérifiée auprès d'Anthropic)",
    "claude.defaultKey": "Clé API Anthropic par défaut",
    "claude.defaultKeyHelp":
      "La clé API Anthropic de l'organisation, pour les modèles Claude. Les utilisateurs approuvés sans clé Anthropic personnelle exécutent les tâches Claude avec elle, dans les limites de leur tier (Tier 1 : Claude Haiku 5.5 uniquement). Elle n'appartient à aucun compte utilisateur et est stockée chiffrée ; après l'enregistrement, seuls ses 4 derniers caractères et la date sont affichés.",
    "claude.workspace": "ID d'espace de travail (facultatif)",
    "claude.workspaceHelp": "Uniquement pour une clé qui n'est liée à aucun espace de travail (clé utilisateur) : l'ID de l'espace de travail Anthropic où s'exécutent les tâches (wrkspc_…). Les clés créées dans un espace de travail de l'Anthropic Console n'en ont pas besoin.",
    "claude.defaultKeyConfirmDelete": "Supprimer la clé API Anthropic par défaut ? Les utilisateurs approuvés sans clé Anthropic personnelle ne pourront plus utiliser les modèles Claude.",
    "sys.noAnthropicKey": "Aucune clé API Anthropic n'est enregistrée, et aucun administrateur ne vous a approuvé.",
    "sys.newThreadProvider": "Le modèle est désormais fourni par un autre fournisseur ; la suite se fait dans un nouveau fil.",
  },
  es: {
    "claude.key": "Clave de API de Anthropic",
    "claude.keyHelp":
      "Se usa para ejecutar trabajos con los modelos Claude. La clave se guarda cifrada con KMS y solo se descifra mientras se ejecuta un trabajo. El uso se factura a su cuenta de Anthropic.",
    "claude.ownKey": "Su propia clave de API de Anthropic (opcional)",
    "claude.ownKeyHelp":
      "Puede usar los modelos Claude sin registrar una clave. Registre la suya solo si quiere que los trabajos de Claude se ejecuten y se facturen en su cuenta de Anthropic. La clave se guarda cifrada con KMS y solo se descifra mientras se ejecuta un trabajo. Si la elimina, todo vuelve a como estaba.",
    "claude.ownKeyActive": "Los trabajos de Claude se ejecutan con su propia clave (…{last4}). El uso se factura a su cuenta de Anthropic.",
    "claude.ready": "No hace falta registrar nada. Puede elegir los modelos Claude directamente.",
    "claude.unavailable": "Los modelos Claude no están disponibles por ahora. Póngase en contacto con un administrador.",
    "claude.keySaved": "Clave de API registrada (verificada con Anthropic)",
    "claude.defaultKey": "Clave de API de Anthropic predeterminada",
    "claude.defaultKeyHelp":
      "La clave de API de Anthropic de la organización, para los modelos Claude. Los usuarios aprobados sin clave de Anthropic propia ejecutan con ella los trabajos de Claude, dentro de su tier (Tier 1: solo Claude Haiku 5.5). No pertenece a ninguna cuenta de usuario y se guarda cifrada; tras guardarla solo se muestran sus 4 últimos caracteres y la fecha.",
    "claude.workspace": "ID del espacio de trabajo (opcional)",
    "claude.workspaceHelp": "Solo para una clave que no está vinculada a un espacio de trabajo (clave de usuario): el ID del espacio de trabajo de Anthropic donde se ejecutan los trabajos (wrkspc_…). Las claves creadas en un espacio de trabajo de la Anthropic Console no lo necesitan.",
    "claude.defaultKeyConfirmDelete": "¿Eliminar la clave de API de Anthropic predeterminada? Los usuarios aprobados sin clave de Anthropic propia ya no podrán usar los modelos Claude.",
    "sys.noAnthropicKey": "No hay ninguna clave de API de Anthropic registrada y ningún administrador le ha aprobado.",
    "sys.newThreadProvider": "El modelo ahora lo ofrece otro proveedor; se continúa en un hilo nuevo.",
  },
  pt: {
    "claude.key": "Chave de API da Anthropic",
    "claude.keyHelp":
      "Usada para executar trabalhos com os modelos Claude. A chave é guardada criptografada com KMS e só é descriptografada durante a execução de um trabalho. O uso é cobrado na sua conta da Anthropic.",
    "claude.ownKey": "Sua própria chave de API da Anthropic (opcional)",
    "claude.ownKeyHelp":
      "Você pode usar os modelos Claude sem registrar uma chave. Registre a sua apenas se quiser que os trabalhos do Claude sejam executados e cobrados na sua conta da Anthropic. A chave é guardada criptografada com KMS e só é descriptografada durante a execução de um trabalho. Ao excluí-la, tudo volta ao que era.",
    "claude.ownKeyActive": "Os trabalhos do Claude são executados com sua própria chave (…{last4}). O uso é cobrado na sua conta da Anthropic.",
    "claude.ready": "Não é preciso registrar nada. Você pode escolher os modelos Claude diretamente.",
    "claude.unavailable": "Os modelos Claude não estão disponíveis no momento. Entre em contato com um administrador.",
    "claude.keySaved": "Chave de API registrada (verificada com a Anthropic)",
    "claude.defaultKey": "Chave de API da Anthropic padrão",
    "claude.defaultKeyHelp":
      "A chave de API da Anthropic da organização, para os modelos Claude. Usuários aprovados sem chave da Anthropic própria executam com ela os trabalhos do Claude, dentro do seu tier (Tier 1: apenas Claude Haiku 5.5). Ela não pertence a nenhuma conta de usuário e é guardada criptografada; depois de salva, só os 4 últimos caracteres e a data são exibidos.",
    "claude.workspace": "ID do workspace (opcional)",
    "claude.workspaceHelp": "Somente para uma chave que não está vinculada a um workspace (chave de usuário): o ID do workspace da Anthropic onde os trabalhos são executados (wrkspc_…). Chaves criadas em um workspace do Anthropic Console não precisam dele.",
    "claude.defaultKeyConfirmDelete": "Excluir a chave de API da Anthropic padrão? Usuários aprovados sem chave da Anthropic própria não poderão mais usar os modelos Claude.",
    "sys.noAnthropicKey": "Nenhuma chave de API da Anthropic está registrada, e nenhum administrador aprovou você.",
    "sys.newThreadProvider": "O modelo agora é oferecido por outro provedor; a execução continua em um novo thread.",
  },
  ru: {
    "claude.key": "API-ключ Anthropic",
    "claude.keyHelp":
      "Используется для запуска заданий на моделях Claude. Ключ хранится в зашифрованном виде (KMS) и расшифровывается только во время выполнения задания. Оплата списывается с вашего аккаунта Anthropic.",
    "claude.ownKey": "Собственный API-ключ Anthropic (необязательно)",
    "claude.ownKeyHelp":
      "Модели Claude можно использовать без регистрации ключа. Добавьте свой ключ, только если хотите, чтобы задания Claude выполнялись и оплачивались через ваш аккаунт Anthropic. Ключ хранится в зашифрованном виде (KMS) и расшифровывается только во время выполнения задания. После удаления всё вернётся как было.",
    "claude.ownKeyActive": "Задания Claude выполняются с вашим ключом (…{last4}). Оплата списывается с вашего аккаунта Anthropic.",
    "claude.ready": "Регистрировать ничего не нужно. Модели Claude можно выбирать сразу.",
    "claude.unavailable": "Модели Claude сейчас недоступны. Обратитесь к администратору.",
    "claude.keySaved": "API-ключ сохранён (проверен в Anthropic)",
    "claude.defaultKey": "API-ключ Anthropic по умолчанию",
    "claude.defaultKeyHelp":
      "API-ключ Anthropic организации для моделей Claude. Одобренные пользователи без собственного ключа Anthropic запускают с ним задания Claude в пределах своего уровня (Tier 1: только Claude Haiku 5.5). Он не принадлежит ни одному аккаунту пользователя и хранится в зашифрованном виде; после сохранения показываются только последние 4 символа и дата.",
    "claude.workspace": "ID рабочего пространства (необязательно)",
    "claude.workspaceHelp": "Только для ключа, не привязанного к рабочему пространству (пользовательский ключ): ID рабочего пространства Anthropic, в котором выполняются задания (wrkspc_…). Ключам, созданным в рабочем пространстве Anthropic Console, он не нужен.",
    "claude.defaultKeyConfirmDelete": "Удалить API-ключ Anthropic по умолчанию? Одобренные пользователи без собственного ключа Anthropic больше не смогут использовать модели Claude.",
    "sys.noAnthropicKey": "API-ключ Anthropic не зарегистрирован, и администратор не одобрил вас.",
    "sys.newThreadProvider": "Модель теперь предоставляет другой провайдер; работа продолжается в новом потоке.",
  },
};
