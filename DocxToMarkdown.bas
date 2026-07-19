Attribute VB_Name = "DocxToMarkdown"
Option Explicit

'====================================================================================
'  WORD (.docx) -> MARKDOWN EXPORTER
'  Run "ExportDocxToMarkdown" (Alt+F8) to pick a .docx file and produce a
'  simplified .md file next to it (same name, .md extension).
'
'  Design choices (per request, to keep this simple and predictable):
'   1. Tracked changes are accepted and comments are deleted before reading, so
'      only the FINAL text is exported (no markup, no comments).
'   2. Images/drawings/embedded objects are removed before reading (ignored).
'   3. Equations (Office Math) are removed before reading (ignored).
'   4. Curly quotes, dashes, ellipses, non-breaking spaces, soft line breaks
'      are normalized to plain ASCII equivalents.
'   5. Heading styles -> # ... ######, tables -> pipe tables, bold/italic ->
'      **bold** / *italic*, hyperlinks -> [text](url), footnotes -> [^n]
'      markers with a "Footnotes:" section at the end.
'
'  Windows only (uses ADODB.Stream and the Office FileDialog object).
'  Limitations: endnotes are not converted (only footnotes); formatting that
'  changes mid-word may not be captured exactly (runs are grouped by whole
'  "words"); numbered lists are all rendered as "1." (valid Markdown - most
'  renderers auto-number regardless of the literal digit).
'====================================================================================

Private g_footnoteCounter As Long

' ------------------------------------------------------------------
'  MAIN ENTRY POINT
' ------------------------------------------------------------------
Public Sub ExportDocxToMarkdown()

    Dim fd As FileDialog
    Dim filePath As String
    Dim doc As Document
    Dim mdOutput As String
    Dim savePath As String

    On Error GoTo ErrHandler

    ' ---------- 1. Ask the user to choose a Word file ----------
    Set fd = Application.FileDialog(msoFileDialogFilePicker)
    With fd
        .Title = "Select a Word document to convert to Markdown"
        .Filters.Clear
        .Filters.Add "Word Documents", "*.docx; *.docm; *.doc"
        .AllowMultiSelect = False
        If .Show <> -1 Then Exit Sub    ' user cancelled
        filePath = .SelectedItems(1)
    End With

    Application.ScreenUpdating = False
    Set doc = Documents.Open(FileName:=filePath, ReadOnly:=False, Visible:=False, AddToRecentFiles:=False)

    ' ---------- 2. Strip everything we're told to ignore ----------
    On Error Resume Next
    doc.AcceptAllRevisions                  ' final text, no tracked-change markup
    doc.Fields.Unlink                       ' TOC/cross-ref/page fields -> static final text
    On Error GoTo 0

    Do While doc.Comments.Count > 0         ' no comments
        doc.Comments(1).Delete
    Loop

    Do While doc.OMaths.Count > 0           ' ignore formulas/equations
        doc.OMaths(1).Range.Delete
    Loop

    Do While doc.InlineShapes.Count > 0     ' ignore inline images/objects
        doc.InlineShapes(1).Delete
    Loop

    Do While doc.Shapes.Count > 0           ' ignore floating graphics
        doc.Shapes(1).Delete
    Loop

    ' ---------- 3. Walk the document body in order ----------
    g_footnoteCounter = 0
    mdOutput = ""

    Dim paras As Paragraphs
    Set paras = doc.Content.Paragraphs
    Dim idx As Long
    idx = 1
    Do While idx <= paras.Count
        Dim p As Paragraph
        Set p = paras(idx)

        If p.Range.Information(wdWithInTable) Then
            Dim tbl As Table
            Set tbl = p.Range.Tables(1)
            AppendTableMarkdown tbl, mdOutput

            Dim tblEnd As Long
            tblEnd = tbl.Range.End
            Do While idx <= paras.Count
                If paras(idx).Range.Start >= tblEnd Then Exit Do
                idx = idx + 1
            Loop
        Else
            AppendParagraphMarkdown p, mdOutput
            idx = idx + 1
        End If
    Loop

    ' ---------- 4. Footnotes section ----------
    If doc.Footnotes.Count > 0 Then
        mdOutput = mdOutput & vbCrLf & "Footnotes:" & vbCrLf & vbCrLf
        Dim i As Long
        For i = 1 To doc.Footnotes.Count
            Dim fnRng As Range
            Set fnRng = doc.Footnotes(i).Range.Duplicate
            If fnRng.End > fnRng.Start Then fnRng.End = fnRng.End - 1   ' drop trailing pilcrow

            Dim fnText As String
            fnText = ConvertRunsToMarkdown(fnRng)
            fnText = ApplyHyperlinks(fnRng, fnText)
            fnText = Replace(fnText, vbCr, " ")
            fnText = Trim$(fnText)

            mdOutput = mdOutput & "[^" & i & "]: " & fnText & vbCrLf
        Next i
    End If

    ' ---------- 5. Save the .md file next to the source file ----------
    If InStrRev(filePath, ".") > 0 Then
        savePath = Left$(filePath, InStrRev(filePath, ".") - 1) & ".md"
    Else
        savePath = filePath & ".md"
    End If

    WriteTextFileUTF8 savePath, mdOutput

    doc.Close SaveChanges:=wdDoNotSaveChanges
    Application.ScreenUpdating = True

    MsgBox "Markdown export complete:" & vbCrLf & savePath, vbInformation, "Docx to Markdown"
    Exit Sub

ErrHandler:
    Application.ScreenUpdating = True
    If Not doc Is Nothing Then
        On Error Resume Next
        doc.Close SaveChanges:=wdDoNotSaveChanges
        On Error GoTo 0
    End If
    MsgBox "Error " & Err.Number & ": " & Err.Description, vbCritical, "Docx to Markdown Failed"
End Sub

' ------------------------------------------------------------------
'  PARAGRAPH -> MARKDOWN LINE
' ------------------------------------------------------------------
Private Sub AppendParagraphMarkdown(p As Paragraph, ByRef mdOutput As String)

    Dim styleName As String
    styleName = ""
    On Error Resume Next
    styleName = p.Range.Style.NameLocal
    On Error GoTo 0

    Dim bodyText As String
    bodyText = ConvertRunsToMarkdown(p.Range)
    bodyText = ApplyHyperlinks(p.Range, bodyText)
    bodyText = Trim$(bodyText)

    ' Heading styles (Heading 1-9, Title, Subtitle)
    Dim headingLevel As Long
    headingLevel = GetHeadingLevel(styleName)
    If headingLevel >= 1 Then
        If Len(bodyText) > 0 Then
            mdOutput = mdOutput & String(headingLevel, "#") & " " & bodyText & vbCrLf & vbCrLf
        End If
        Exit Sub
    End If

    ' List paragraph (bulleted or numbered)
    Dim listType As WdListType
    listType = p.Range.ListFormat.ListType
    If listType <> wdListNoNumbering Then
        Dim level As Long
        level = 1
        On Error Resume Next
        level = p.Range.ListFormat.ListLevelNumber
        On Error GoTo 0

        Dim indentStr As String
        indentStr = String((level - 1) * 2, " ")

        Dim marker As String
        If listType = wdListBullet Or listType = wdListPictureBullet Then
            marker = "- "
        Else
            marker = "1. "
        End If

        mdOutput = mdOutput & indentStr & marker & bodyText & vbCrLf
        Exit Sub
    End If

    ' Blank paragraph -> blank line
    If Len(bodyText) = 0 Then
        mdOutput = mdOutput & vbCrLf
        Exit Sub
    End If

    ' Normal paragraph
    mdOutput = mdOutput & bodyText & vbCrLf & vbCrLf

End Sub

Private Function GetHeadingLevel(ByVal styleName As String) As Long
    If LCase$(Left$(styleName, 7)) = "heading" Then
        Dim numPart As String
        numPart = Trim$(Mid$(styleName, 8))
        If IsNumeric(numPart) Then
            Dim lvl As Long
            lvl = CLng(numPart)
            If lvl > 6 Then lvl = 6
            If lvl < 1 Then lvl = 1
            GetHeadingLevel = lvl
            Exit Function
        End If
    End If
    If LCase$(styleName) = "title" Then
        GetHeadingLevel = 1
        Exit Function
    End If
    If LCase$(styleName) = "subtitle" Then
        GetHeadingLevel = 2
        Exit Function
    End If
    GetHeadingLevel = 0
End Function

' ------------------------------------------------------------------
'  TABLE -> MARKDOWN PIPE TABLE
' ------------------------------------------------------------------
Private Sub AppendTableMarkdown(tbl As Table, ByRef mdOutput As String)
    Dim r As Long, c As Long
    Dim numCols As Long
    numCols = tbl.Columns.Count

    For r = 1 To tbl.Rows.Count
        Dim rowText As String
        rowText = "|"
        For c = 1 To numCols
            Dim cellText As String
            cellText = ""
            On Error Resume Next
            cellText = GetCellMarkdown(tbl.Cell(r, c))
            On Error GoTo 0
            rowText = rowText & " " & cellText & " |"
        Next c
        mdOutput = mdOutput & rowText & vbCrLf

        If r = 1 Then
            Dim sep As String
            sep = "|"
            For c = 1 To numCols
                sep = sep & " --- |"
            Next c
            mdOutput = mdOutput & sep & vbCrLf
        End If
    Next r
    mdOutput = mdOutput & vbCrLf
End Sub

Private Function GetCellMarkdown(cel As Cell) As String
    Dim rng As Range
    Set rng = cel.Range.Duplicate
    If rng.End > rng.Start Then rng.End = rng.End - 1   ' drop trailing cell mark

    Dim t As String
    t = ConvertRunsToMarkdown(rng)
    t = ApplyHyperlinks(rng, t)
    t = Replace(t, vbCr, " ")   ' flatten multi-paragraph cells to one line
    t = Trim$(t)
    GetCellMarkdown = t
End Function

' ------------------------------------------------------------------
'  INLINE RUN CONVERSION  (bold/italic + footnote markers, word by word)
' ------------------------------------------------------------------
Private Function ConvertRunsToMarkdown(rng As Range) As String
    Dim result As String
    result = ""

    If rng.Start >= rng.End Then
        ConvertRunsToMarkdown = ""
        Exit Function
    End If

    Dim openBold As Boolean, openItalic As Boolean
    openBold = False
    openItalic = False

    Dim w As Range
    For Each w In rng.Words
        Dim wText As String
        wText = w.Text

        Dim b As Boolean, it As Boolean
        b = (w.Bold = True)
        it = (w.Italic = True)

        ' close formatting that no longer applies (italic first, then bold - proper nesting)
        If openItalic And Not it Then
            result = result & "*"
            openItalic = False
        End If
        If openBold And Not b Then
            result = result & "**"
            openBold = False
        End If
        ' open new formatting (bold first, then italic)
        If b And Not openBold Then
            result = result & "**"
            openBold = True
        End If
        If it And Not openItalic Then
            result = result & "*"
            openItalic = True
        End If

        ' footnote / endnote reference markers show up as Chr(2) in the text
        Do While InStr(wText, Chr(2)) > 0
            g_footnoteCounter = g_footnoteCounter + 1
            wText = Replace(wText, Chr(2), "[^" & g_footnoteCounter & "]", 1, 1)
        Loop

        result = result & CleanSpecialChars(wText)
    Next w

    If openItalic Then result = result & "*"
    If openBold Then result = result & "**"

    ConvertRunsToMarkdown = result
End Function

' ------------------------------------------------------------------
'  HYPERLINKS -> [text](url)
' ------------------------------------------------------------------
Private Function ApplyHyperlinks(rng As Range, ByVal bodyText As String) As String
    Dim result As String
    result = bodyText

    On Error Resume Next
    If rng.Hyperlinks.Count > 0 Then
        Dim h As Hyperlink
        For Each h In rng.Hyperlinks
            Dim dispText As String, addr As String
            dispText = Trim$(CleanSpecialChars(h.TextToDisplay))
            addr = h.Address
            If Len(addr) = 0 Then addr = h.SubAddress
            If Len(dispText) > 0 And Len(addr) > 0 Then
                If InStr(result, dispText) > 0 Then
                    result = Replace(result, dispText, "[" & dispText & "](" & addr & ")", 1, 1)
                End If
            End If
        Next h
    End If
    On Error GoTo 0

    ApplyHyperlinks = result
End Function

' ------------------------------------------------------------------
'  SPECIAL CHARACTER NORMALIZATION
' ------------------------------------------------------------------
Private Function CleanSpecialChars(ByVal s As String) As String
    Dim t As String
    t = s
    t = Replace(t, Chr(8220), """")     ' left double quote
    t = Replace(t, Chr(8221), """")     ' right double quote
    t = Replace(t, Chr(8216), "'")      ' left single quote
    t = Replace(t, Chr(8217), "'")      ' right single quote / apostrophe
    t = Replace(t, Chr(8212), "--")     ' em dash
    t = Replace(t, Chr(8211), "-")      ' en dash
    t = Replace(t, Chr(8230), "...")    ' ellipsis
    t = Replace(t, Chr(160), " ")       ' non-breaking space
    t = Replace(t, Chr(12), "")         ' page break
    t = Replace(t, Chr(11), "  " & vbCrLf) ' soft line break -> markdown line break

    ' escape characters that have special meaning in Markdown
    t = Replace(t, "\", "\\")
    t = Replace(t, "|", "\|")

    CleanSpecialChars = t
End Function

' ------------------------------------------------------------------
'  FILE WRITING (UTF-8)
' ------------------------------------------------------------------
Private Sub WriteTextFileUTF8(ByVal filePath As String, ByVal content As String)
    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Type = 2            ' adTypeText
    stream.Charset = "utf-8"
    stream.Open
    stream.WriteText content
    stream.SaveToFile filePath, 2   ' adSaveCreateOverWrite
    stream.Close
End Sub
