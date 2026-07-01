Attribute VB_Name = "modWBSBuilder"
Option Explicit

'==================================================================
'  WBS Builder from JSON  -  Excel 2021 (32-bit & 64-bit safe)
'------------------------------------------------------------------
'  - Prompts for a JSON file via the standard Open dialog
'  - Parses it with a self-contained JSON parser (NO references
'    to add, no ScriptControl - works on 64-bit Office)
'  - Builds a NEW worksheet with an outlined WBS where each
'    summary (parent) row sits ABOVE its detail rows.
'
'  Expected node shape (flat array, any order):
'     { "id", "name", "parentId", "level", "weight" }
'  The tree is rebuilt from id / parentId, so file order does
'  not matter.
'
'  HOW TO RUN:  Alt+F8  ->  BuildWBSFromJson  ->  Run
'==================================================================

'----------------------------------------------------------------
'  ENTRY POINT
'----------------------------------------------------------------
Public Sub BuildWBSFromJson()
    Dim picked As Variant
    picked = Application.GetOpenFilename( _
        FileFilter:="JSON Files (*.json),*.json,All Files (*.*),*.*", _
        Title:="Select the WBS JSON file")
    If VarType(picked) = vbBoolean Then Exit Sub    ' user cancelled

    Dim raw As String
    raw = ReadTextFileUtf8(CStr(picked))
    If Len(Trim$(raw)) = 0 Then
        MsgBox "The selected file is empty or could not be read.", vbExclamation
        Exit Sub
    End If

    Dim parsed As Object
    On Error GoTo ParseErr
    Set parsed = ParseJson(raw)
    On Error GoTo 0

    If TypeName(parsed) <> "Collection" Then
        MsgBox "The top level of the JSON must be an array [ ... ].", vbExclamation
        Exit Sub
    End If

    RenderWBS parsed
    Exit Sub

ParseErr:
    MsgBox "Failed to parse the JSON file:" & vbCrLf & Err.Description, vbCritical
End Sub

'----------------------------------------------------------------
'  BUILD THE SHEET + OUTLINE
'----------------------------------------------------------------
Private Sub RenderWBS(ByRef nodes As Object)
    Dim byId As Object, kids As Object
    Set byId = CreateObject("Scripting.Dictionary")
    Set kids = CreateObject("Scripting.Dictionary")
    byId.CompareMode = vbTextCompare
    kids.CompareMode = vbTextCompare

    Dim rootIds As Collection
    Set rootIds = New Collection

    ' --- Index nodes by id and group child ids by parent id ---
    Dim v As Variant, nd As Object, id As String, pid As String
    Dim pidVar As Variant
    For Each v In nodes
        Set nd = v
        id = CStr(nd("id"))
        If Not byId.Exists(id) Then byId.Add id, nd

        pidVar = nd("parentId")
        If IsNull(pidVar) Then
            rootIds.Add id
        ElseIf Len(Trim$(CStr(pidVar))) = 0 Then
            rootIds.Add id
        Else
            pid = CStr(pidVar)
            If Not kids.Exists(pid) Then kids.Add pid, New Collection
            kids(pid).Add id
        End If
    Next v

    ' --- Target workbook / new sheet ---
    Dim wb As Workbook
    Set wb = ActiveWorkbook
    If wb Is Nothing Then Set wb = Workbooks.Add

    Dim ws As Worksheet
    Set ws = wb.Worksheets.Add(After:=wb.Worksheets(wb.Worksheets.Count))
    ws.Name = UniqueSheetName(wb, "WBS")

    Application.ScreenUpdating = False

    ' Summary row ABOVE detail (this is the key setting requested)
    ws.Outline.SummaryRow = xlSummaryAbove
    ws.Outline.AutomaticStyles = False

    ' --- Header ---
    ws.Range("A1").Value = "WBS ID"
    ws.Range("B1").Value = "Description"
    ws.Range("C1").Value = "Weight (%)"
    ws.Range("D1").Value = "Level"
    With ws.Range("A1:D1")
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(31, 78, 120)
        .HorizontalAlignment = xlCenter
    End With
    ws.Range("A1:B1").HorizontalAlignment = xlLeft

    ' --- Write rows depth-first, grouping as we go ---
    Dim nextRow As Long: nextRow = 2
    Dim rid As Variant
    For Each rid In rootIds
        WriteNode ws, CStr(rid), byId, kids, nextRow
    Next rid

    Dim lastRow As Long: lastRow = nextRow - 1

    ' --- Cosmetics ---
    With ws
        .Columns("A").ColumnWidth = 16
        .Columns("B").ColumnWidth = 54
        .Columns("C").ColumnWidth = 12
        .Columns("D").ColumnWidth = 7
        If lastRow >= 2 Then
            .Range("C2:C" & lastRow).NumberFormat = "0.0"
            .Range("D2:D" & lastRow).HorizontalAlignment = xlCenter
        End If
        .Range("A1:D" & lastRow).Borders.LineStyle = xlContinuous
        .Range("A1:D" & lastRow).Borders.Color = RGB(200, 200, 200)
        .Rows(1).RowHeight = 20
    End With

    ' Freeze the header row
    ws.Activate
    ws.Range("A2").Select
    ActiveWindow.FreezePanes = True

    Application.ScreenUpdating = True

    MsgBox "WBS created: " & (lastRow - 1) & " items on sheet '" & ws.Name & "'." & vbCrLf & _
           "Use the outline buttons (1 2 3 4) at the top-left to collapse / expand.", _
           vbInformation
End Sub

'----------------------------------------------------------------
'  Recursively write a node and its subtree, then group the
'  subtree's rows under the node's (summary) row.
'  Returns the last row index used by this subtree.
'----------------------------------------------------------------
Private Function WriteNode(ByRef ws As Worksheet, ByVal id As String, _
                           ByRef byId As Object, ByRef kids As Object, _
                           ByRef nextRow As Long) As Long
    Dim nd As Object: Set nd = byId(id)
    Dim myRow As Long: myRow = nextRow
    Dim lvl As Long: lvl = ToLong(nd("level"))

    Dim ind As Long: ind = lvl
    If ind > 15 Then ind = 15        ' Excel IndentLevel hard limit

    ws.Cells(myRow, 1).Value = id
    ws.Cells(myRow, 2).Value = CStr(nd("name"))
    ws.Cells(myRow, 2).IndentLevel = ind
    ws.Cells(myRow, 3).Value = ToDouble(nd("weight"))
    ws.Cells(myRow, 4).Value = lvl

    nextRow = nextRow + 1
    Dim lastRow As Long: lastRow = myRow

    If kids.Exists(id) Then
        ' Highlight summary rows
        With ws.Cells(myRow, 1).Resize(1, 4)
            .Font.Bold = True
            Select Case lvl
                Case 0: .Interior.Color = RGB(217, 225, 242)
                Case 1: .Interior.Color = RGB(236, 240, 248)
            End Select
        End With

        Dim childId As Variant
        For Each childId In kids(id)
            lastRow = WriteNode(ws, CStr(childId), byId, kids, nextRow)
        Next childId

        ' Group the detail block; with SummaryRow=xlSummaryAbove the
        ' collapse/expand control attaches to myRow (the row above).
        ws.Rows(CStr(myRow + 1) & ":" & CStr(lastRow)).Group
    End If

    WriteNode = lastRow
End Function

'================================================================
'  Minimal JSON parser (objects, arrays, strings, numbers,
'  true/false/null).  Returns:
'     object  -> Scripting.Dictionary
'     array   -> VBA Collection
'     string  -> String
'     number  -> Double
'     bool    -> Boolean
'     null    -> Null
'================================================================
Private Function ParseJson(ByVal s As String) As Variant
    Dim pos As Long: pos = 1
    SkipWs s, pos
    Dim ch As String: ch = Mid$(s, pos, 1)
    If ch = "[" Or ch = "{" Then
        Set ParseJson = ParseValue(s, pos)
    Else
        ParseJson = ParseValue(s, pos)
    End If
End Function

Private Function ParseValue(ByRef s As String, ByRef pos As Long) As Variant
    SkipWs s, pos
    Dim ch As String: ch = Mid$(s, pos, 1)
    Select Case ch
        Case "{":          Set ParseValue = ParseObject(s, pos)
        Case "[":          Set ParseValue = ParseArray(s, pos)
        Case Chr$(34):     ParseValue = ParseString(s, pos)
        Case "t", "f":     ParseValue = ParseBoolean(s, pos)
        Case "n":          ParseNullKeyword s, pos: ParseValue = Null
        Case Else:         ParseValue = ParseNumber(s, pos)
    End Select
End Function

Private Function ParseObject(ByRef s As String, ByRef pos As Long) As Object
    Dim obj As Object
    Set obj = CreateObject("Scripting.Dictionary")
    obj.CompareMode = vbTextCompare
    pos = pos + 1                       ' skip {
    SkipWs s, pos
    If Mid$(s, pos, 1) = "}" Then
        pos = pos + 1
        Set ParseObject = obj
        Exit Function
    End If
    Do
        SkipWs s, pos
        Dim key As String
        key = ParseString(s, pos)
        SkipWs s, pos
        pos = pos + 1                   ' skip :
        If obj.Exists(key) Then
            obj(key) = ParseValue(s, pos)
        Else
            obj.Add key, ParseValue(s, pos)
        End If
        SkipWs s, pos
        Dim c As String: c = Mid$(s, pos, 1)
        pos = pos + 1                   ' skip , or }
        If c = "}" Then Exit Do
    Loop
    Set ParseObject = obj
End Function

Private Function ParseArray(ByRef s As String, ByRef pos As Long) As Collection
    Dim col As Collection
    Set col = New Collection
    pos = pos + 1                       ' skip [
    SkipWs s, pos
    If Mid$(s, pos, 1) = "]" Then
        pos = pos + 1
        Set ParseArray = col
        Exit Function
    End If
    Do
        col.Add ParseValue(s, pos)
        SkipWs s, pos
        Dim c As String: c = Mid$(s, pos, 1)
        pos = pos + 1                   ' skip , or ]
        If c = "]" Then Exit Do
    Loop
    Set ParseArray = col
End Function

Private Function ParseString(ByRef s As String, ByRef pos As Long) As String
    Dim sb As String, ch As String, e As String
    pos = pos + 1                       ' skip opening quote
    Do
        ch = Mid$(s, pos, 1)
        If ch = Chr$(34) Then
            pos = pos + 1
            Exit Do
        ElseIf ch = "\" Then
            pos = pos + 1
            e = Mid$(s, pos, 1)
            Select Case e
                Case Chr$(34): sb = sb & Chr$(34)
                Case "\":      sb = sb & "\"
                Case "/":      sb = sb & "/"
                Case "b":      sb = sb & Chr$(8)
                Case "f":      sb = sb & Chr$(12)
                Case "n":      sb = sb & vbLf
                Case "r":      sb = sb & vbCr
                Case "t":      sb = sb & vbTab
                Case "u"
                    sb = sb & ChrW$(CLng("&H" & Mid$(s, pos + 1, 4)))
                    pos = pos + 4
                Case Else:     sb = sb & e
            End Select
            pos = pos + 1
        ElseIf Len(ch) = 0 Then
            Exit Do                     ' unterminated string - bail safely
        Else
            sb = sb & ch
            pos = pos + 1
        End If
    Loop
    ParseString = sb
End Function

Private Function ParseNumber(ByRef s As String, ByRef pos As Long) As Double
    Dim startPos As Long: startPos = pos
    Dim ch As String
    Do While pos <= Len(s)
        ch = Mid$(s, pos, 1)
        If InStr("0123456789+-.eE", ch) > 0 Then
            pos = pos + 1
        Else
            Exit Do
        End If
    Loop
    ParseNumber = Val(Mid$(s, startPos, pos - startPos))   ' Val => "." decimal, locale-safe
End Function

Private Function ParseBoolean(ByRef s As String, ByRef pos As Long) As Boolean
    If LCase$(Mid$(s, pos, 4)) = "true" Then
        pos = pos + 4
        ParseBoolean = True
    Else
        pos = pos + 5                   ' false
        ParseBoolean = False
    End If
End Function

Private Sub ParseNullKeyword(ByRef s As String, ByRef pos As Long)
    pos = pos + 4                       ' null
End Sub

Private Sub SkipWs(ByRef s As String, ByRef pos As Long)
    Dim ch As String
    Do While pos <= Len(s)
        ch = Mid$(s, pos, 1)
        If ch = " " Or ch = vbTab Or ch = vbCr Or ch = vbLf Then
            pos = pos + 1
        Else
            Exit Do
        End If
    Loop
End Sub

'----------------------------------------------------------------
'  Helpers
'----------------------------------------------------------------
Private Function ReadTextFileUtf8(ByVal path As String) As String
    ' ADODB.Stream reads UTF-8 correctly (handles the special
    ' non-breaking hyphens etc. in the sample) and strips any BOM.
    Dim stm As Object
    Set stm = CreateObject("ADODB.Stream")
    stm.Type = 2                        ' adTypeText
    stm.Charset = "utf-8"
    stm.Open
    stm.LoadFromFile path
    ReadTextFileUtf8 = stm.ReadText(-1) ' adReadAll
    stm.Close
End Function

Private Function ToLong(ByVal v As Variant) As Long
    If IsNumeric(v) Then ToLong = CLng(v) Else ToLong = 0
End Function

Private Function ToDouble(ByVal v As Variant) As Double
    If IsNumeric(v) Then ToDouble = CDbl(v) Else ToDouble = 0
End Function

Private Function UniqueSheetName(ByVal wb As Workbook, ByVal baseName As String) As String
    Dim nm As String: nm = baseName
    Dim i As Long: i = 1
    Do While SheetExists(wb, nm)
        i = i + 1
        nm = baseName & " (" & i & ")"
    Loop
    UniqueSheetName = nm
End Function

Private Function SheetExists(ByVal wb As Workbook, ByVal nm As String) As Boolean
    Dim sh As Object
    On Error Resume Next
    Set sh = wb.Sheets(nm)
    On Error GoTo 0
    SheetExists = Not (sh Is Nothing)
End Function
