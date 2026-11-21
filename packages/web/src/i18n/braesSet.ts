import type { UiLocale } from "@cobrac/shared";

/**
 * UI strings of the BRAES submission set (BraesDownloadButton.tsx), kept apart from the main catalogs and merged into
 * them in index.tsx. Every locale defines every key.
 */
export const braesSetEn = {
  "braesSet.button": "BRAES set",
  "braesSet.tip":
    "Download the files the BRAES submission form asks for (BRA data, BIF / HCD / FRG images, form values) as a zip",
  "braesSet.title": "BRAES submission set",
  "braesSet.contents":
    "BRA data as CSVs for the BRA Data Converter, BIF / HCD / FRG images (draw.io XML) and the values to enter in the submission form.",
  "braesSet.idLabel": "BRAES Project ID",
  "braesSet.idHelp":
    "Initial (up to 5 capital letters) + last two digits of the year + English running title (words joined in UpperCamelCase, up to 30 characters), e.g. YT20Oculomotor. Use an ID that WholeBIF does not use yet. It is written into the BRA data and the file names, and saved with the project.",
  "braesSet.idInvalid": "BRAES does not accept this form (e.g. YT20Oculomotor).",
  "braesSet.download": "Download",
};

export type BraesSetKey = keyof typeof braesSetEn;

export const BRAES_SET_CATALOG: Record<UiLocale, Record<BraesSetKey, string>> = {
  en: braesSetEn,
  ja: {
    "braesSet.button": "BRAES 提出セット",
    "braesSet.tip":
      "BRAES の投稿フォームに添付するファイル一式（BRA データ、BIF・HCD・FRG の図、記入メモ）を zip でダウンロード",
    "braesSet.title": "BRAES 提出セット",
    "braesSet.contents":
      "BRA Data Converter に渡す BRA データの CSV、BIF・HCD・FRG の図（draw.io の XML）、投稿フォームに入れる値のメモをまとめてダウンロードします。",
    "braesSet.idLabel": "BRAES の Project ID",
    "braesSet.idHelp":
      "イニシャル（大文字 5 字まで）＋西暦の下 2 桁＋英語の題名（単語の頭を大文字にしてつなげ、30 字まで）。例: YT20Oculomotor。WholeBIF でまだ使われていない ID にしてください。BRA データとファイル名に書き込み、プロジェクトに保存します。",
    "braesSet.idInvalid":
      "この形式では BRAES に出せません（例: YT20Oculomotor）。",
    "braesSet.download": "ダウンロード",
  },
  zh: {
    "braesSet.button": "BRAES 提交包",
    "braesSet.tip":
      "以 zip 下载 BRAES 提交表单所需的文件（BRA 数据、BIF / HCD / FRG 图、表单填写备忘）",
    "braesSet.title": "BRAES 提交包",
    "braesSet.contents":
      "供 BRA Data Converter 使用的 BRA 数据 CSV、BIF / HCD / FRG 图（draw.io XML）以及提交表单要填写的内容。",
    "braesSet.idLabel": "BRAES Project ID",
    "braesSet.idHelp":
      "首字母（最多 5 个大写字母）+ 年份后两位 + 英文标题（单词首字母大写相连，最多 30 个字符），例如 YT20Oculomotor。请使用 WholeBIF 中尚未使用的 ID。它会写入 BRA 数据和文件名，并保存到项目中。",
    "braesSet.idInvalid": "BRAES 不接受此格式（例如 YT20Oculomotor）。",
    "braesSet.download": "下载",
  },
  zhTw: {
    "braesSet.button": "BRAES 提交包",
    "braesSet.tip":
      "以 zip 下載 BRAES 提交表單所需的檔案（BRA 資料、BIF / HCD / FRG 圖、表單填寫備忘）",
    "braesSet.title": "BRAES 提交包",
    "braesSet.contents":
      "供 BRA Data Converter 使用的 BRA 資料 CSV、BIF / HCD / FRG 圖（draw.io XML）以及提交表單要填寫的內容。",
    "braesSet.idLabel": "BRAES Project ID",
    "braesSet.idHelp":
      "首字母（最多 5 個大寫字母）+ 年份後兩位 + 英文標題（單字首字母大寫相連，最多 30 個字元），例如 YT20Oculomotor。請使用 WholeBIF 中尚未使用的 ID。它會寫入 BRA 資料和檔名，並儲存到專案中。",
    "braesSet.idInvalid": "BRAES 不接受此格式（例如 YT20Oculomotor）。",
    "braesSet.download": "下載",
  },
  ko: {
    "braesSet.button": "BRAES 제출 세트",
    "braesSet.tip":
      "BRAES 제출 양식에 필요한 파일(BRA 데이터, BIF / HCD / FRG 그림, 양식 입력 메모)을 zip으로 다운로드",
    "braesSet.title": "BRAES 제출 세트",
    "braesSet.contents":
      "BRA Data Converter용 BRA 데이터 CSV, BIF / HCD / FRG 그림(draw.io XML), 제출 양식에 입력할 값을 함께 다운로드합니다.",
    "braesSet.idLabel": "BRAES Project ID",
    "braesSet.idHelp":
      "이니셜(대문자 5자까지) + 연도 끝 두 자리 + 영어 제목(단어 첫 글자를 대문자로 이어 붙여 30자까지). 예: YT20Oculomotor. WholeBIF에서 아직 쓰이지 않은 ID를 사용하세요. BRA 데이터와 파일 이름에 쓰이고 프로젝트에 저장됩니다.",
    "braesSet.idInvalid": "BRAES에서 받지 않는 형식입니다(예: YT20Oculomotor).",
    "braesSet.download": "다운로드",
  },
  de: {
    "braesSet.button": "BRAES-Paket",
    "braesSet.tip":
      "Die Dateien für das BRAES-Einreichungsformular (BRA-Daten, BIF- / HCD- / FRG-Bilder, Formularwerte) als zip herunterladen",
    "braesSet.title": "BRAES-Einreichungspaket",
    "braesSet.contents":
      "BRA-Daten als CSV für den BRA Data Converter, BIF- / HCD- / FRG-Bilder (draw.io-XML) und die Werte für das Einreichungsformular.",
    "braesSet.idLabel": "BRAES-Project-ID",
    "braesSet.idHelp":
      "Initialen (bis zu 5 Großbuchstaben) + letzte zwei Ziffern des Jahres + englischer Kurztitel (Wörter in UpperCamelCase, bis zu 30 Zeichen), z. B. YT20Oculomotor. Verwenden Sie eine ID, die WholeBIF noch nicht nutzt. Sie wird in die BRA-Daten und die Dateinamen geschrieben und beim Projekt gespeichert.",
    "braesSet.idInvalid":
      "Diese Form nimmt BRAES nicht an (z. B. YT20Oculomotor).",
    "braesSet.download": "Herunterladen",
  },
  fr: {
    "braesSet.button": "Lot BRAES",
    "braesSet.tip":
      "Télécharger en zip les fichiers demandés par le formulaire de soumission BRAES (données BRA, images BIF / HCD / FRG, valeurs du formulaire)",
    "braesSet.title": "Lot de soumission BRAES",
    "braesSet.contents":
      "Données BRA en CSV pour le BRA Data Converter, images BIF / HCD / FRG (XML draw.io) et les valeurs à saisir dans le formulaire de soumission.",
    "braesSet.idLabel": "Project ID BRAES",
    "braesSet.idHelp":
      "Initiales (5 majuscules au plus) + deux derniers chiffres de l'année + titre court en anglais (mots en UpperCamelCase, 30 caractères au plus), p. ex. YT20Oculomotor. Utilisez un ID que WholeBIF n'utilise pas encore. Il est écrit dans les données BRA et les noms de fichiers, et enregistré avec le projet.",
    "braesSet.idInvalid":
      "BRAES n'accepte pas cette forme (p. ex. YT20Oculomotor).",
    "braesSet.download": "Télécharger",
  },
  es: {
    "braesSet.button": "Paquete BRAES",
    "braesSet.tip":
      "Descargar en zip los archivos que pide el formulario de envío de BRAES (datos BRA, imágenes BIF / HCD / FRG, valores del formulario)",
    "braesSet.title": "Paquete de envío BRAES",
    "braesSet.contents":
      "Datos BRA en CSV para el BRA Data Converter, imágenes BIF / HCD / FRG (XML de draw.io) y los valores para el formulario de envío.",
    "braesSet.idLabel": "Project ID de BRAES",
    "braesSet.idHelp":
      "Iniciales (hasta 5 mayúsculas) + dos últimas cifras del año + título corto en inglés (palabras en UpperCamelCase, hasta 30 caracteres), p. ej. YT20Oculomotor. Use un ID que WholeBIF aún no use. Se escribe en los datos BRA y en los nombres de archivo, y se guarda con el proyecto.",
    "braesSet.idInvalid": "BRAES no acepta esta forma (p. ej. YT20Oculomotor).",
    "braesSet.download": "Descargar",
  },
  pt: {
    "braesSet.button": "Pacote BRAES",
    "braesSet.tip":
      "Baixar em zip os arquivos pedidos pelo formulário de envio do BRAES (dados BRA, imagens BIF / HCD / FRG, valores do formulário)",
    "braesSet.title": "Pacote de envio BRAES",
    "braesSet.contents":
      "Dados BRA em CSV para o BRA Data Converter, imagens BIF / HCD / FRG (XML do draw.io) e os valores para o formulário de envio.",
    "braesSet.idLabel": "Project ID do BRAES",
    "braesSet.idHelp":
      "Iniciais (até 5 maiúsculas) + dois últimos dígitos do ano + título curto em inglês (palavras em UpperCamelCase, até 30 caracteres), p. ex. YT20Oculomotor. Use um ID que o WholeBIF ainda não use. Ele é gravado nos dados BRA e nos nomes dos arquivos e salvo com o projeto.",
    "braesSet.idInvalid":
      "O BRAES não aceita este formato (p. ex. YT20Oculomotor).",
    "braesSet.download": "Baixar",
  },
  ru: {
    "braesSet.button": "Пакет BRAES",
    "braesSet.tip":
      "Скачать zip с файлами для формы отправки BRAES (данные BRA, изображения BIF / HCD / FRG, значения для формы)",
    "braesSet.title": "Пакет для отправки в BRAES",
    "braesSet.contents":
      "Данные BRA в CSV для BRA Data Converter, изображения BIF / HCD / FRG (XML draw.io) и значения для формы отправки.",
    "braesSet.idLabel": "Project ID для BRAES",
    "braesSet.idHelp":
      "Инициалы (до 5 заглавных букв) + две последние цифры года + краткое название на английском (слова в UpperCamelCase, до 30 символов), например YT20Oculomotor. Используйте ID, которого ещё нет в WholeBIF. Он записывается в данные BRA и имена файлов и сохраняется в проекте.",
    "braesSet.idInvalid":
      "BRAES не принимает такой формат (например, YT20Oculomotor).",
    "braesSet.download": "Скачать",
  },
};
