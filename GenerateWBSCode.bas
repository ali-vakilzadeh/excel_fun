'How to use this WBS Code Generator script:
' Before running, ensure your worksheet has an explicit hierarchical outline using Excel’s Data → Group feature—each row must have an OutlineLevel (1 for top‑level items, 2 for sub‑items, etc.).
' Select any cell in the column where you want the WBS codes (e.g., “1”, “1.1”, “1.1.2”) to appear, then run the GenerateWBSHierarchy macro.
' The script will ask you to confirm the column and start row, then search downward for a stop marker “EOWBS” (or ask to proceed without one) to define the processing range.
' After you confirm the range, it clears any existing codes in that column and regenerates them based on the outline levels.

'What the macro does and how it handles your data:
' For each row (from the selected cell to the stop marker), the script reads the outline level and updates internal counters per level—each level increments when encountered, and lower levels reset (so you get sequential numbering like 1, 2, 3 under the same parent, and 1.1, 1.2, etc.).
' It writes the generated code (e.g., “1.2.3”) into the cell, applies bold formatting to level‑1 items, and indents deeper levels.
' The macro validates outline levels (must be 1–20, no jumps >1) and collects warnings for any irregularities, showing them in a final summary.
' It auto‑fits the column and reports processed/skipped rows and the maximum level used.
' This gives you a fully automatic, outline‑driven WBS numbering system without manual typing.

Sub GenerateWBSHierarchy()
    Dim ws As Worksheet
    Dim startCell As Range
    Dim currentRow As Long
    Dim lastRow As Long
    Dim wbsColumn As Integer
    Dim outlineLevel As Integer
    Dim levelCounters() As Long
    Dim i As Integer
    Dim cellValue As String
    Dim eowbsFound As Boolean
    Dim processedCount As Long
    Dim skippedCount As Long
    Dim validationErrors As Collection
    Dim lastValidLevel As Integer
    
    ' Initialize error collection
    Set validationErrors = New Collection
    
    ' Get current worksheet and cell
    Set ws = ActiveSheet
    Set startCell = ActiveCell
    wbsColumn = startCell.Column
    
    ' Validate starting position
    If startCell.Row = 1 Then
        MsgBox "Please select a cell below row 1 to start.", vbExclamation
        Exit Sub
    End If
    
    ' Check if outline levels are available
    On Error Resume Next
    outlineLevel = ws.Rows(startCell.Row).outlineLevel
    If Err.Number <> 0 Then
        MsgBox "No outline groups detected. Please create Excel groups first using the Group feature under Data tab.", vbExclamation
        Exit Sub
    End If
    On Error GoTo 0
    
    ' Ask for options
    Dim userResponse As VbMsgBoxResult
    userResponse = MsgBox("WBS Generation Options:" & vbCrLf & vbCrLf & _
                         "Column: " & Split(ws.Cells(1, wbsColumn).Address, "$")(1) & vbCrLf & _
                         "Start Row: " & startCell.Row & vbCrLf & vbCrLf & _
                         "Choose an option:", _
                         vbYesNoCancel + vbQuestion, "WBS Generation Options")
    
    If userResponse = vbCancel Then Exit Sub
    
    ' Find EOWBS
    lastRow = FindEOWBS(ws, wbsColumn, startCell.Row)
    
    If lastRow = 0 Then
        ' Ask if user wants to continue without EOWBS
        If MsgBox("EOWBS not found. Do you want to process until the last row with data?", _
                  vbYesNo + vbQuestion, "EOWBS Not Found") = vbNo Then
            Exit Sub
        Else
            lastRow = ws.Cells(ws.Rows.Count, wbsColumn).End(xlUp).Row
            If lastRow < startCell.Row Then
                lastRow = ws.UsedRange.Rows.Count + startCell.Row
            End If
        End If
    End If
    
    ' Confirm range
    If MsgBox("Processing range: Rows " & startCell.Row & " to " & (lastRow - 1) & vbCrLf & _
              "Total rows to process: " & (lastRow - startCell.Row) & vbCrLf & vbCrLf & _
              "Proceed?", vbYesNo + vbQuestion) = vbNo Then
        Exit Sub
    End If  ' Fixed: Changed End Sub to End If
    
    ' Clear existing values
    ws.Range(ws.Cells(startCell.Row, wbsColumn), ws.Cells(lastRow - 1, wbsColumn)).ClearContents
    
    ' Initialize counters
    ReDim levelCounters(1 To 20)
    For i = 1 To 20
        levelCounters(i) = 0
    Next i
    
    ' Initialize counters
    processedCount = 0
    skippedCount = 0
    lastValidLevel = 1
    
    ' Process each row
    For currentRow = startCell.Row To lastRow - 1
        ' Get outline level with error handling
        On Error Resume Next
        outlineLevel = ws.Rows(currentRow).outlineLevel
        If Err.Number <> 0 Then
            outlineLevel = 1 ' Default to level 1 if error
            Err.Clear
        End If
        On Error GoTo 0
        
        ' Validate outline level
        If outlineLevel < 1 Or outlineLevel > 20 Then
            validationErrors.Add "Row " & currentRow & ": Invalid outline level " & outlineLevel
            skippedCount = skippedCount + 1
            GoTo NextRow
        End If
        
        ' Check for level jumps (can't jump more than 1 level at a time)
        If outlineLevel > lastValidLevel + 1 Then
            validationErrors.Add "Row " & currentRow & ": Level jump from " & lastValidLevel & " to " & outlineLevel
        End If
        
        ' Update counters
        UpdateCounters levelCounters, outlineLevel
        
        ' Generate WBS code
        cellValue = GenerateWBSCode(levelCounters, outlineLevel)
        
        ' Write to cell
        ws.Cells(currentRow, wbsColumn).Value = cellValue
        
        ' Apply formatting based on level
        With ws.Cells(currentRow, wbsColumn)
            .Font.Bold = (outlineLevel = 1)
            .IndentLevel = outlineLevel - 1
        End With
        
        processedCount = processedCount + 1
        lastValidLevel = outlineLevel
        
NextRow:
        ' Allow Excel to breathe
        If currentRow Mod 100 = 0 Then DoEvents
    Next currentRow
    
    ' Auto-fit column
    ws.Columns(wbsColumn).AutoFit
    
    ' Show results
    Dim resultMsg As String
    resultMsg = "WBS Generation Complete!" & vbCrLf & vbCrLf & _
                "Rows processed: " & processedCount & vbCrLf & _
                "Rows skipped: " & skippedCount & vbCrLf & _
                "Maximum level: " & GetMaxNonZeroLevel(levelCounters)
    
    ' Show validation errors if any
    If validationErrors.Count > 0 Then
        resultMsg = resultMsg & vbCrLf & vbCrLf & "Warnings (" & validationErrors.Count & "):"
        For i = 1 To validationErrors.Count
            resultMsg = resultMsg & vbCrLf & validationErrors(i)
            If i >= 5 Then ' Show only first 5 errors
                resultMsg = resultMsg & vbCrLf & "... and " & (validationErrors.Count - 5) & " more"
                Exit For
            End If
        Next i
    End If
    
    MsgBox resultMsg, vbInformation
End Sub

Function FindEOWBS(ws As Worksheet, col As Integer, startRow As Long) As Long
    Dim searchRange As Range
    Dim foundCell As Range
    
    ' Search for EOWBS in the specified column
    Set searchRange = ws.Range(ws.Cells(startRow, col), ws.Cells(ws.Rows.Count, col))
    Set foundCell = searchRange.Find(What:="EOWBS", LookIn:=xlValues, LookAt:=xlWhole)
    
    If Not foundCell Is Nothing Then
        FindEOWBS = foundCell.Row
    Else
        FindEOWBS = 0
    End If
End Function

Sub UpdateCounters(ByRef counters() As Long, ByVal level As Integer)
    Dim i As Integer
    
    ' Increment the counter for this level
    counters(level) = counters(level) + 1
    
    ' Reset all lower level counters to 0
    For i = level + 1 To UBound(counters)
        counters(i) = 0
    Next i
End Sub

Function GenerateWBSCode(counters() As Long, ByVal level As Integer) As String
    Dim i As Integer
    Dim result As String
    
    result = ""
    
    ' Build the WBS code using only levels up to the current level
    For i = 1 To level
        If i > 1 Then
            result = result & "."
        End If
        result = result & counters(i)
    Next i
    
    GenerateWBSCode = result
End Function

Function GetMaxNonZeroLevel(counters() As Long) As Integer
    Dim i As Integer
    
    For i = UBound(counters) To 1 Step -1
        If counters(i) > 0 Then
            GetMaxNonZeroLevel = i
            Exit Function
        End If
    Next i
    
    GetMaxNonZeroLevel = 0
End Function


' Helper function to validate WBS structure
Function ValidateWBSStructure(ws As Worksheet, startRow As Long, endRow As Long, col As Integer) As Collection
    Dim errors As New Collection
    Dim i As Long
    Dim prevCode As String
    Dim currentCode As String
    Dim prevLevels() As String
    Dim currentLevels() As String
    
    prevCode = ""
    
    For i = startRow To endRow
        currentCode = Trim(ws.Cells(i, col).Value)
        
        If currentCode <> "" Then
            If prevCode <> "" Then
                ' Split codes into levels
                prevLevels = Split(prevCode, ".")
                currentLevels = Split(currentCode, ".")
                
                ' Check if codes are sequential
                If UBound(currentLevels) >= 0 And UBound(prevLevels) >= 0 Then
                    ' Compare last level
                    If currentLevels(UBound(currentLevels)) <> CStr(CLng(prevLevels(UBound(prevLevels))) + 1) Then
                        errors.Add "Row " & i & ": Non-sequential code - Previous: " & prevCode & ", Current: " & currentCode
                    End If
                End If
            End If
        End If
        
        prevCode = currentCode
    Next i
    
    Set ValidateWBSStructure = errors
End Function

