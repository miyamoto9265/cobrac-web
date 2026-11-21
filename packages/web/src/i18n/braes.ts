import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the BRAES submission set (BraesDownloadButton.tsx), kept apart from the main catalogs and merged into
 * them in index.tsx. Every locale defines every key.
 */
export const braesEn = {
  "braes.button": "BRAES set",
  "braes.tip": "Download the files the BRAES submission form asks for (BRA data, BIF / HCD / FRG images, form values) as a zip",
  "braes.title": "BRAES submission set",
  "braes.contents": "BRA data (xlsx), BIF / HCD / FRG images (draw.io XML) and the values to enter in the submission form.",
  "braes.idLabel": "BRAES Project ID",
  "braes.idHelp":
    "Initial (up to 5 capital letters) + last two digits of the year + English running title (words joined in UpperCamelCase, up to 30 characters), e.g. YT20Oculomotor. Use an ID that WholeBIF does not use yet. It is written into the BRA data and the file names, and saved with the project.",
  "braes.idInvalid": "BRAES does not accept this form (e.g. YT20Oculomotor).",
  "braes.download": "Download",
};

export type BraesKey = keyof typeof braesEn;

export const BRAES_CATALOG: Record<UiLocale, Record<BraesKey, string>> = {
  en: braesEn,
  ja: {
    "braes.button": "BRAES 提出セット",
    "braes.tip": "BRAES の投稿フォームに添付するファイル一式（BRA データ、BIF・HCD・FRG の図、記入メモ）を zip でダウンロード",
    "braes.title": "BRAES 提出セット",
    "braes.contents": "BRA データ（xlsx）、BIF・HCD・FRG の図（draw.io の XML）、投稿フォームに入れる値のメモをまとめてダウンロードします。",
    "braes.idLabel": "BRAES の Project ID",
    "braes.idHelp":
      "イニシャル（大文字 5 字まで）＋西暦の下 2 桁＋英語の題名（単語の頭を大文字にしてつなげ、30 字まで）。例: YT20Oculomotor。WholeBIF でまだ使われていない ID にしてください。BRA データとファイル名に書き込み、プロジェクトに保存します。",
    "braes.idInvalid": "この形式では BRAES に出せません（例: YT20Oculomotor）。",
    "braes.download": "ダウンロード",
  },
  zh: {
    "braes.button": "BRAES 提交包",
    "braes.tip": "以 zip 下载 BRAES 提交表单所需的文件（BRA 数据、BIF / HCD / FRG 图、表单填写备忘）",
    "braes.title": "BRAES 提交包",
    "braes.contents": "BRA 数据（xlsx）、BIF / HCD / FRG 图（draw.io XML）以及提交表单要填写的内容。",
    "braes.idLabel": "BRAES Project ID",
    "braes.idHelp": "首字母（最多 5 个大写字母）+ 年份后两位 + 英文标题（单词首字母大写相连，最多 30 个字符），例如 YT20Oculomotor。请使用 WholeBIF 中尚未使用的 ID。它会写入 BRA 数据和文件名，并保存到项目中。",
    "braes.idInvalid": "BRAES 不接受此格式（例如 YT20Oculomotor）。",
    "braes.download": "下载",
  },
  zhTw: {
    "braes.button": "BRAES 提交包",
    "braes.tip": "以 zip 下載 BRAES 提交表單所需的檔案（BRA 資料、BIF / HCD / FRG 圖、表單填寫備忘）",
    "braes.title": "BRAES 提交包",
    "braes.contents": "BRA 資料（xlsx）、BIF / HCD / FRG 圖（draw.io XML）以及提交表單要填寫的內容。",
    "braes.idLabel": "BRAES Project ID",
    "braes.idHelp": "首字母（最多 5 個大寫字母）+ 年份後兩位 + 英文標題（單字首字母大寫相連，最多 30 個字元），例如 YT20Oculomotor。請使用 WholeBIF 中尚未使用的 ID。它會寫入 BRA 資料和檔名，並儲存到專案中。",
    "braes.idInvalid": "BRAES 不接受此格式（例如 YT20Oculomotor）。",
    "braes.download": "下載",
  },
  ko: {
    "braes.button": "BRAES 제출 세트",
    "braes.tip": "BRAES 제출 양식에 필요한 파일(BRA 데이터, BIF / HCD / FRG 그림, 양식 입력 메모)을 zip으로 다운로드",
    "braes.title": "BRAES 제출 세트",
    "braes.contents": "BRA 데이터(xlsx), BIF / HCD / FRG 그림(draw.io XML), 제출 양식에 입력할 값을 함께 다운로드합니다.",
    "braes.idLabel": "BRAES Project ID",
    "braes.idHelp": "이니셜(대문자 5자까지) + 연도 끝 두 자리 + 영어 제목(단어 첫 글자를 대문자로 이어 붙여 30자까지). 예: YT20Oculomotor. WholeBIF에서 아직 쓰이지 않은 ID를 사용하세요. BRA 데이터와 파일 이름에 쓰이고 프로젝트에 저장됩니다.",
    "braes.idInvalid": "BRAES에서 받지 않는 형식입니다(예: YT20Oculomotor).",
    "braes.download": "다운로드",
  },
  de: {
    "braes.button": "BRAES-Paket",
    "braes.tip": "Die Dateien für das BRAES-Einreichungsformular (BRA-Daten, BIF- / HCD- / FRG-Bilder, Formularwerte) als zip herunterladen",
    "braes.title": "BRAES-Einreichungspaket",
    "braes.contents": "BRA-Daten (xlsx), BIF- / HCD- / FRG-Bilder (draw.io-XML) und die Werte für das Einreichungsformular.",
    "braes.idLabel": "BRAES-Project-ID",
    "braes.idHelp":
      "Initialen (bis zu 5 Großbuchstaben) + letzte zwei Ziffern des Jahres + englischer Kurztitel (Wörter in UpperCamelCase, bis zu 30 Zeichen), z. B. YT20Oculomotor. Verwenden Sie eine ID, die WholeBIF noch nicht nutzt. Sie wird in die BRA-Daten und die Dateinamen geschrieben und beim Projekt gespeichert.",
    "braes.idInvalid": "Diese Form nimmt BRAES nicht an (z. B. YT20Oculomotor).",
    "braes.download": "Herunterladen",
  },
  fr: {
    "braes.button": "Lot BRAES",
    "braes.tip": "Télécharger en zip les fichiers demandés par le formulaire de soumission BRAES (données BRA, images BIF / HCD / FRG, valeurs du formulaire)",
    "braes.title": "Lot de soumission BRAES",
    "braes.contents": "Données BRA (xlsx), images BIF / HCD / FRG (XML draw.io) et les valeurs à saisir dans le formulaire de soumission.",
    "braes.idLabel": "Project ID BRAES",
    "braes.idHelp":
      "Initiales (5 majuscules au plus) + deux derniers chiffres de l'année + titre court en anglais (mots en UpperCamelCase, 30 caractères au plus), p. ex. YT20Oculomotor. Utilisez un ID que WholeBIF n'utilise pas encore. Il est écrit dans les données BRA et les noms de fichiers, et enregistré avec le projet.",
    "braes.idInvalid": "BRAES n'accepte pas cette forme (p. ex. YT20Oculomotor).",
    "braes.download": "Télécharger",
  },
  es: {
    "braes.button": "Paquete BRAES",
    "braes.tip": "Descargar en zip los archivos que pide el formulario de envío de BRAES (datos BRA, imágenes BIF / HCD / FRG, valores del formulario)",
    "braes.title": "Paquete de envío BRAES",
    "braes.contents": "Datos BRA (xlsx), imágenes BIF / HCD / FRG (XML de draw.io) y los valores para el formulario de envío.",
    "braes.idLabel": "Project ID de BRAES",
    "braes.idHelp":
      "Iniciales (hasta 5 mayúsculas) + dos últimas cifras del año + título corto en inglés (palabras en UpperCamelCase, hasta 30 caracteres), p. ej. YT20Oculomotor. Use un ID que WholeBIF aún no use. Se escribe en los datos BRA y en los nombres de archivo, y se guarda con el proyecto.",
    "braes.idInvalid": "BRAES no acepta esta forma (p. ej. YT20Oculomotor).",
    "braes.download": "Descargar",
  },
  pt: {
    "braes.button": "Pacote BRAES",
    "braes.tip": "Baixar em zip os arquivos pedidos pelo formulário de envio do BRAES (dados BRA, imagens BIF / HCD / FRG, valores do formulário)",
    "braes.title": "Pacote de envio BRAES",
    "braes.contents": "Dados BRA (xlsx), imagens BIF / HCD / FRG (XML do draw.io) e os valores para o formulário de envio.",
    "braes.idLabel": "Project ID do BRAES",
    "braes.idHelp":
      "Iniciais (até 5 maiúsculas) + dois últimos dígitos do ano + título curto em inglês (palavras em UpperCamelCase, até 30 caracteres), p. ex. YT20Oculomotor. Use um ID que o WholeBIF ainda não use. Ele é gravado nos dados BRA e nos nomes dos arquivos e salvo com o projeto.",
    "braes.idInvalid": "O BRAES não aceita este formato (p. ex. YT20Oculomotor).",
    "braes.download": "Baixar",
  },
  ru: {
    "braes.button": "Пакет BRAES",
    "braes.tip": "Скачать zip с файлами для формы отправки BRAES (данные BRA, изображения BIF / HCD / FRG, значения для формы)",
    "braes.title": "Пакет для отправки в BRAES",
    "braes.contents": "Данные BRA (xlsx), изображения BIF / HCD / FRG (XML draw.io) и значения для формы отправки.",
    "braes.idLabel": "Project ID для BRAES",
    "braes.idHelp":
      "Инициалы (до 5 заглавных букв) + две последние цифры года + краткое название на английском (слова в UpperCamelCase, до 30 символов), например YT20Oculomotor. Используйте ID, которого ещё нет в WholeBIF. Он записывается в данные BRA и имена файлов и сохраняется в проекте.",
    "braes.idInvalid": "BRAES не принимает такой формат (например, YT20Oculomotor).",
    "braes.download": "Скачать",
  },
};
