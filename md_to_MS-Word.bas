Attribute VB_Name = "MarkdownImporter"
Option Explicit

'====================================================================================
'  MARKDOWN -> WORD IMPORTER
'  Run "ImportMarkdownToWord" (Alt+F8) to pick a .md file and convert it into a
'  new, formatted Word document: headings, bold/italic, bullet & numbered lists,
'  tables, fenced code blocks, blockquotes, horizontal rules, links, and local
'  images are all converted to native Word formatting.
'
'  Windows only (uses ADODB.Stream and the Office FileDialog object).
'====================================================================================

Private g_mdFolder As String
Private g_bodyFont As String

' ------------------------------------------------------------------
'  MAIN ENTRY POINT
' ------------------------------------------------------------------
Public Sub ImportMarkdownToWord()

    Dim fd As FileDialog
    Dim filePath As String
    Dim rawText As String
    Dim lines() As String
    Dim i As Long
    Dim doc As Document
    Dim rng As Range

    Dim inCodeBlock As Boolean
    Dim tableBuf() As String
    Dim tableBufCount As Long
    Dim inTable As Boolean
    Dim lineText As String

    On Error GoTo ErrHandler

    ' ---------- 1. Ask the user to choose a Markdown file ----------
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    With fd
        .Title = "Select a Markdown (.md) file to import"
        .Filters.Clear
        .Filters.Add "Markdown files", "*.md"
        .Filters.Add "Text files", "*.txt"
        .Filters.Add "All files", "*.*"
        .AllowMultiSelect = False
        If .Show <> -1 Then Exit Sub   ' user cancelled
        filePath = .SelectedItems(1)
    End With

    g_mdFolder = Left$(filePath, InStrRev(filePath, "\"))

    ' ---------- 2. Read the file (UTF-8 safe) ----------
    rawText = ReadTextFileUTF8(filePath)
    rawText = Replace(rawText, vbCrLf, vbLf)
    rawText = Replace(rawText, vbCr, vbLf)
    lines = Split(rawText, vbLf)

    ' ---------- 3. Prepare a new document ----------
    Set doc = Documents.Add
    g_bodyFont = doc.Styles(wdStyleNormal).Font.Name

    Set rng = doc.Content
    rng.Collapse Direction:=wdCollapseEnd

    Application.ScreenUpdating = False

    ReDim tableBuf(UBound(lines) + 1)
    tableBufCount = 0
    inTable = False
    inCodeBlock = False

    ' ---------- 4. Walk through every line ----------
    For i = 0 To UBound(lines)
        lineText = lines(i)

        ' Fenced code block open/close ( ``` )
        If Left$(LTrim$(lineText), 3) = "```" Then
            If inTable Then
                FlushTable doc, rng, tableBuf, tableBufCount
                tableBufCount = 0
                inTable = False
            End If
            inCodeBlock = Not inCodeBlock
            GoTo ContinueFor
        End If

        If inCodeBlock Then
            InsertCodeLine rng, lineText
            GoTo ContinueFor
        End If

        ' Table row?
        If IsTableRow(lineText) Then
            tableBuf(tableBufCount) = lineText
            tableBufCount = tableBufCount + 1
            inTable = True
            GoTo ContinueFor
        Else
            If inTable Then
                FlushTable doc, rng, tableBuf, tableBufCount
                tableBufCount = 0
                inTable = False
            End If
        End If

        ' Everything else (headings, lists, quotes, images, HR, plain text)
        ProcessLine doc, rng, lineText

ContinueFor:
    Next i

    If inTable And tableBufCount > 0 Then
        FlushTable doc, rng, tableBuf, tableBufCount
    End If

    Application.ScreenUpdating = True
    MsgBox "Markdown import complete (" & (UBound(lines) + 1) & " lines processed).", _
        vbInformation, "Markdown Import"
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    MsgBox "Error " & Err.Number & ": " & Err.Description, vbCritical, "Markdown Import Failed"
End Sub

' ------------------------------------------------------------------
'  FILE READING (UTF-8 safe, no project reference needed)
' ------------------------------------------------------------------
Private Function ReadTextFileUTF8(ByVal filePath As String) As String
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2            ' adTypeText
    stream.Charset = "utf-8"
    stream.Open
    stream.LoadFromFile filePath
    ReadTextFileUTF8 = stream.ReadText
    stream.Close
End Function

' ------------------------------------------------------------------
'  LINE-LEVEL DISPATCH
' ------------------------------------------------------------------
Private Sub ProcessLine(doc As Document, rng As Range, ByVal lineText As String)

    Dim tline As String
    Dim content As String
    Dim indentLevel As Long
    Dim headerLevel As Long
    Dim imgAlt As String, imgPath As String

    tline = Trim$(lineText)

    ' Blank line -> paragraph break
    If Len(tline) = 0 Then
        rng.InsertParagraphAfter
        rng.Collapse Direction:=wdCollapseEnd
        Exit Sub
    End If

    ' Horizontal rule ( ---  ***  ___ )
    If IsHorizontalRule(tline) Then
        AddHorizontalRule doc, rng
        Exit Sub
    End If

    ' Image  ![alt](path)
    If IsImageLine(tline, imgAlt, imgPath) Then
        AddImage doc, rng, imgPath, imgAlt
        Exit Sub
    End If

    ' Headers (#, ##, ... up to ######)
    headerLevel = CountLeadingHashes(tline)
    If headerLevel >= 1 Then
        content = Trim$(Mid$(tline, headerLevel + 1))
        AddParagraph doc, rng, content, "Heading " & headerLevel
        Exit Sub
    End If

    ' Blockquote
    If Left$(tline, 1) = ">" Then
        content = Trim$(Mid$(tline, 2))
        AddParagraph doc, rng, content, "Quote"
        Exit Sub
    End If

    ' Unordered list
    If IsUnorderedListItem(lineText, content, indentLevel) Then
        If indentLevel > 4 Then indentLevel = 4
        AddParagraph doc, rng, content, ListStyleName("List Bullet", indentLevel)
        Exit Sub
    End If

    ' Ordered list
    If IsOrderedListItem(lineText, content, indentLevel) Then
        If indentLevel > 4 Then indentLevel = 4
        AddParagraph doc, rng, content, ListStyleName("List Number", indentLevel)
        Exit Sub
    End If

    ' Default: normal paragraph
    AddParagraph doc, rng, tline, "Normal"

End Sub

Private Function ListStyleName(ByVal base As String, ByVal indentLevel As Long) As String
    If indentLevel <= 0 Then
        ListStyleName = base
    Else
        ListStyleName = base & " " & (indentLevel + 1)
    End If
End Function

' ------------------------------------------------------------------
'  BLOCK BUILDER  (a text paragraph with a given Word style)
' ------------------------------------------------------------------
Private Sub AddParagraph(doc As Document, rng As Range, ByVal content As String, ByVal styleName As String)
    Dim startPos As Long
    startPos = rng.Start

    InsertFormattedText rng, content

    rng.InsertParagraphAfter
    rng.Collapse Direction:=wdCollapseEnd

    Dim paraRange As Range
    Set paraRange = doc.Range(startPos, rng.Start)
    On Error Resume Next
    If Len(styleName) > 0 Then
        paraRange.Paragraphs(1).Style = doc.Styles(styleName)
    End If
    On Error GoTo 0
End Sub

Private Sub AddHorizontalRule(doc As Document, rng As Range)
    Dim startPos As Long
    startPos = rng.Start
    rng.InsertParagraphAfter
    rng.Collapse Direction:=wdCollapseEnd

    Dim paraRange As Range
    Set paraRange = doc.Range(startPos, rng.Start)
    With paraRange.Paragraphs(1).Borders(wdBorderBottom)
        .LineStyle = wdLineStyleSingle
        .LineWidth = wdLineWidth150pt
        .Color = wdColorGray50
    End With
End Sub

Private Sub AddImage(doc As Document, rng As Range, ByVal imgPath As String, ByVal altText As String)
    On Error GoTo Fallback

    Dim fullPath As String
    If InStr(imgPath, ":\") > 0 Or LCase$(Left$(imgPath, 4)) = "http" Then
        fullPath = imgPath
    Else
        fullPath = g_mdFolder & Replace(imgPath, "/", "\")
    End If

    If LCase$(Left$(fullPath, 4)) = "http" Then GoTo Fallback   ' remote images are skipped
    If Dir(fullPath) = "" Then GoTo Fallback

    doc.InlineShapes.AddPicture FileName:=fullPath, LinkToFile:=False, _
        SaveWithDocument:=True, Range:=rng
    rng.Collapse Direction:=wdCollapseEnd
    rng.InsertParagraphAfter
    rng.Collapse Direction:=wdCollapseEnd
    Exit Sub

Fallback:
    AddParagraph doc, rng, "[Image: " & altText & " (" & imgPath & ")]", "Normal"
End Sub

' ------------------------------------------------------------------
'  INLINE FORMATTING  (bold, italic, inline code, links)
' ------------------------------------------------------------------
Private Sub InsertFormattedText(rng As Range, ByVal text As String)
    If Len(text) = 0 Then Exit Sub

    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Global = True
    re.Pattern = "(\[[^\]]+\]\([^\)]+\))|(\*\*\*[^*]+?\*\*\*)|(___[^_]+?___)|(\*\*[^*]+?\*\*)|(__[^_]+?__)|(\*[^*]+?\*)|(_[^_]+?_)|(`[^`]+?`)"

    Dim matches As Object
    Set matches = re.Execute(text)

    If matches.Count = 0 Then
        InsertRun rng, text, "plain"
        Exit Sub
    End If

    Dim pos As Long
    pos = 1
    Dim m As Object
    Dim matchedText As String

    For Each m In matches
        If m.FirstIndex + 1 > pos Then
            InsertRun rng, Mid$(text, pos, m.FirstIndex + 1 - pos), "plain"
        End If

        matchedText = m.Value

        If Left$(matchedText, 1) = "[" Then
            Dim closeBracket As Long, linkText As String, linkUrl As String
            closeBracket = InStr(matchedText, "]")
            linkText = Mid$(matchedText, 2, closeBracket - 2)
            linkUrl = Mid$(matchedText, closeBracket + 2, Len(matchedText) - closeBracket - 2)
            InsertLinkRun rng, linkText, linkUrl
        ElseIf Left$(matchedText, 3) = "***" Or Left$(matchedText, 3) = "___" Then
            InsertRun rng, Mid$(matchedText, 4, Len(matchedText) - 6), "boldit"
        ElseIf Left$(matchedText, 2) = "**" Or Left$(matchedText, 2) = "__" Then
            InsertRun rng, Mid$(matchedText, 3, Len(matchedText) - 4), "bold"
        ElseIf Left$(matchedText, 1) = "`" Then
            InsertRun rng, Mid$(matchedText, 2, Len(matchedText) - 2), "code"
        Else
            InsertRun rng, Mid$(matchedText, 2, Len(matchedText) - 2), "italic"
        End If

        pos = m.FirstIndex + m.Length + 1
    Next m

    If pos <= Len(text) Then
        InsertRun rng, Mid$(text, pos), "plain"
    End If
End Sub

Private Sub InsertRun(rng As Range, ByVal txt As String, ByVal kind As String)
    If Len(txt) = 0 Then Exit Sub

    rng.InsertAfter txt

    rng.Bold = False
    rng.Italic = False
    rng.Font.Name = g_bodyFont
    rng.Shading.Texture = wdTextureNone

    Select Case kind
        Case "bold"
            rng.Bold = True
        Case "italic"
            rng.Italic = True
        Case "boldit"
            rng.Bold = True
            rng.Italic = True
        Case "code"
            rng.Font.Name = "Consolas"
            rng.Shading.Texture = wdTextureSolid
            rng.Shading.BackgroundPatternColor = RGB(240, 240, 240)
    End Select

    rng.Collapse Direction:=wdCollapseEnd
End Sub

Private Sub InsertLinkRun(rng As Range, ByVal displayText As String, ByVal url As String)
    rng.Bold = False
    rng.Italic = False
    rng.Font.Name = g_bodyFont
    rng.Shading.Texture = wdTextureNone
    rng.InsertAfter displayText
    rng.Document.Hyperlinks.Add Anchor:=rng, Address:=url
    rng.Collapse Direction:=wdCollapseEnd
End Sub

' ------------------------------------------------------------------
'  FENCED CODE BLOCKS
' ------------------------------------------------------------------
Private Sub InsertCodeLine(rng As Range, ByVal lineText As String)
    rng.InsertAfter lineText
    rng.Font.Name = "Consolas"
    rng.Font.Size = 10
    rng.Shading.Texture = wdTextureSolid
    rng.Shading.BackgroundPatternColor = RGB(245, 245, 245)
    rng.Collapse Direction:=wdCollapseEnd

    rng.InsertParagraphAfter
    rng.Collapse Direction:=wdCollapseEnd
End Sub

' ------------------------------------------------------------------
'  TABLES  (GitHub-flavoured pipe tables)
' ------------------------------------------------------------------
Private Function IsTableRow(ByVal lineText As String) As Boolean
    Dim t As String
    t = Trim$(lineText)
    IsTableRow = (Len(t) > 0 And InStr(t, "|") > 0)
End Function

Private Function IsSeparatorRow(ByVal lineText As String) As Boolean
    Dim t As String
    t = Trim$(lineText)
    t = Replace(t, "|", "")
    t = Replace(t, "-", "")
    t = Replace(t, ":", "")
    t = Replace(t, " ", "")
    IsSeparatorRow = (Len(t) = 0)
End Function

Private Function SplitTableRow(ByVal lineText As String) As String()
    Dim t As String
    t = Trim$(lineText)
    If Left$(t, 1) = "|" Then t = Mid$(t, 2)
    If Right$(t, 1) = "|" Then t = Left$(t, Len(t) - 1)
    SplitTableRow = Split(t, "|")
End Function

Private Sub FlushTable(doc As Document, rng As Range, rawLines() As String, ByVal cnt As Long)
    Dim dataRows As New Collection
    Dim i As Long
    For i = 0 To cnt - 1
        If Not IsSeparatorRow(rawLines(i)) Then dataRows.Add rawLines(i)
    Next i
    If dataRows.Count = 0 Then Exit Sub

    Dim firstCells() As String
    firstCells = SplitTableRow(dataRows(1))
    Dim numCols As Long
    numCols = UBound(firstCells) - LBound(firstCells) + 1
    If numCols < 1 Then Exit Sub

    Dim tbl As Table
    Set tbl = doc.Tables.Add(Range:=rng, NumRows:=dataRows.Count, NumColumns:=numCols)
    tbl.Style = "Table Grid"
    tbl.AutoFitBehavior wdAutoFitWindow

    Dim r As Long, c As Long
    Dim cells() As String
    For r = 1 To dataRows.Count
        cells = SplitTableRow(dataRows(r))
        For c = 1 To numCols
            If c - 1 <= UBound(cells) Then
                tbl.Cell(r, c).Range.Text = Trim$(cells(c - 1))
            End If
        Next c
    Next r

    tbl.Rows(1).Range.Font.Bold = True
    tbl.Rows(1).HeadingFormat = True

    rng.SetRange Start:=tbl.Range.End, End:=tbl.Range.End
    rng.Collapse Direction:=wdCollapseEnd
End Sub

' ------------------------------------------------------------------
'  LINE CLASSIFIERS
' ------------------------------------------------------------------
Private Function CountLeadingHashes(ByVal t As String) As Long
    Dim n As Long
    n = 0
    Do While n < Len(t) And n < 6
        If Mid$(t, n + 1, 1) = "#" Then
            n = n + 1
        Else
            Exit Do
        End If
    Loop
    CountLeadingHashes = n
End Function

Private Function IsHorizontalRule(ByVal t As String) As Boolean
    Dim stripped As String
    stripped = Replace(t, " ", "")
    If Len(stripped) < 3 Then
        IsHorizontalRule = False
        Exit Function
    End If
    Dim onlyDashes As String, onlyStars As String, onlyUnders As String
    onlyDashes = Replace(stripped, "-", "")
    onlyStars = Replace(stripped, "*", "")
    onlyUnders = Replace(stripped, "_", "")
    IsHorizontalRule = (Len(onlyDashes) = 0) Or (Len(onlyStars) = 0) Or (Len(onlyUnders) = 0)
End Function

Private Function IsImageLine(ByVal t As String, ByRef altText As String, ByRef imgPath As String) As Boolean
    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "^!\[([^\]]*)\]\(([^\)]+)\)$"
    If re.Test(t) Then
        Dim m As Object
        Set m = re.Execute(t)(0)
        altText = m.SubMatches(0)
        imgPath = m.SubMatches(1)
        IsImageLine = True
    Else
        IsImageLine = False
    End If
End Function

Private Function IsUnorderedListItem(ByVal lineText As String, ByRef content As String, ByRef indentLevel As Long) As Boolean
    Dim leadingSpaces As Long
    Dim t As String
    leadingSpaces = Len(lineText) - Len(LTrim$(lineText))
    t = LTrim$(lineText)
    If Len(t) >= 2 Then
        If (Left$(t, 1) = "-" Or Left$(t, 1) = "*" Or Left$(t, 1) = "+") And Mid$(t, 2, 1) = " " Then
            content = Trim$(Mid$(t, 3))
            indentLevel = leadingSpaces \ 2
            IsUnorderedListItem = True
            Exit Function
        End If
    End If
    IsUnorderedListItem = False
End Function

Private Function IsOrderedListItem(ByVal lineText As String, ByRef content As String, ByRef indentLevel As Long) As Boolean
    Dim leadingSpaces As Long
    Dim t As String
    leadingSpaces = Len(lineText) - Len(LTrim$(lineText))
    t = LTrim$(lineText)

    Dim re As Object
    Set re = CreateObject("VBScript.RegExp")
    re.Pattern = "^(\d+)\.\s+(.*)$"
    If re.Test(t) Then
        Dim m As Object
        Set m = re.Execute(t)(0)
        content = m.SubMatches(1)
        indentLevel = leadingSpaces \ 2
        IsOrderedListItem = True
    Else
        IsOrderedListItem = False
    End If
End Function
