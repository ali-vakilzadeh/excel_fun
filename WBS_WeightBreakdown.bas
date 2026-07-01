'How to use this WBS Weight Breakdown script:
'Before running the macro, ensure your Excel sheet is properly set up.
' Your WBS hierarchy must be explicitly grouped using Excel’s Data → Group feature (so that each row has an OutlineLevel).
' Place your weight percentages (as decimals between 0 and 1) in the column immediately to the left of where you want the breakdown results.
' In the breakdown column, you must manually enter the final calculated values for all Level 1 parent items—the script will only write formulas for deeper levels (2, 3, etc.).
' To start, select any cell within the breakdown column below row 1, then run the CreateWBSBreakdownFormulas macro.

' What the macro does and how to respond to prompts:
' The script will first ask you for a stop marker (default: "EOWBS")—place this exact text in the breakdown column at the end of your data to define the processing range; if it’s missing, you’ll be given the option to process until the last non-empty row.
' After confirming the range, the macro scans each row’s outline level: it stores the parent row for each level, then inserts a formula into every child cell (= ParentBreakdownValue * Weight) so that each sub-item’s breakdown automatically updates based on its parent’s value and its own percentage weight.
' The code validates that weights are numeric and within 0–1, skips invalid rows with warnings, auto-fits the columns, and finalizes the process with a summary message.
' This lets you maintain a fully dynamic, hierarchically calculated WBS breakdown without manually building hundreds of cell references.


Sub CreateWBSBreakdownFormulas()
    Dim ws As Worksheet
    Dim startCell As Range
    Dim currentRow As Long
    Dim lastRow As Long
    Dim breakdownCol As Integer
    Dim weightCol As Integer
    Dim outlineLevel As Integer
    Dim parentRows() As Long
    Dim maxLevel As Integer
    Dim i As Integer
    Dim parentRow As Long
    Dim weightValue As Variant
    Dim parentAddress As String
    Dim weightAddress As String
    Dim eowbsFound As Boolean
    
    ' Initialize
    Set ws = ActiveSheet
    Set startCell = ActiveCell
    breakdownCol = startCell.Column
    weightCol = breakdownCol - 1
    
    ' Validate weight column exists
    If weightCol < 1 Then
        MsgBox "There is no column to the left for weights. Please select a column that has a left neighbor.", vbExclamation
        Exit Sub
    End If
    
    ' Validate starting row (must have a manual value for level 1)
    If startCell.Row = 1 Then
        MsgBox "Please select a cell below row 1 to start.", vbExclamation
        Exit Sub
    End If
    
    ' Check if outline levels are available
    On Error Resume Next
    outlineLevel = ws.Rows(startCell.Row).OutlineLevel
    If Err.Number <> 0 Then
        MsgBox "No outline groups detected. Please create Excel groups first using the Group feature under Data tab.", vbExclamation
        Exit Sub
    End If
    On Error GoTo 0
    
    ' Ask user for stop marker
    Dim stopMarker As String
    stopMarker = InputBox("Enter the stop marker value (default is 'EOWBS'):", "Stop Marker", "EOWBS")
    If stopMarker = "" Then stopMarker = "EOWBS"
    
    ' Find stop marker in the breakdown column
    lastRow = FindStopMarker(ws, breakdownCol, startCell.Row, stopMarker)
    
    If lastRow = 0 Then
        ' Ask if user wants to continue without stop marker
        If MsgBox("Stop marker '" & stopMarker & "' not found. Do you want to process until the last row with data?", _
                  vbYesNo + vbQuestion, "Stop Marker Not Found") = vbNo Then
            Exit Sub
        Else
            lastRow = ws.Cells(ws.Rows.Count, breakdownCol).End(xlUp).Row
            If lastRow < startCell.Row Then
                lastRow = ws.UsedRange.Rows.Count + startCell.Row
            End If
        End If
    End If
    
    ' Confirm range
    If MsgBox("Processing range: Rows " & startCell.Row & " to " & (lastRow - 1) & vbCrLf & _
              "Breakdown column: " & Split(ws.Cells(1, breakdownCol).Address, "$")(1) & vbCrLf & _
              "Weight column: " & Split(ws.Cells(1, weightCol).Address, "$")(1) & vbCrLf & _
              "Total rows to process: " & (lastRow - startCell.Row) & vbCrLf & vbCrLf & _
              "Proceed?", vbYesNo + vbQuestion) = vbNo Then
        Exit Sub
    End If
    
    ' Initialize parent rows array (support up to 20 levels)
    ReDim parentRows(1 To 20)
    For i = 1 To 20
        parentRows(i) = 0
    Next i
    
    ' Process each row
    For currentRow = startCell.Row To lastRow - 1
        ' Get outline level with error handling
        On Error Resume Next
        outlineLevel = ws.Rows(currentRow).OutlineLevel
        If Err.Number <> 0 Then
            outlineLevel = 1 ' Default to level 1 if error
            Err.Clear
        End If
        On Error GoTo 0
        
        ' Skip if outline level is invalid
        If outlineLevel < 1 Or outlineLevel > 20 Then
            MsgBox "Invalid outline level (" & outlineLevel & ") at row " & currentRow & ". Skipping.", vbExclamation
            GoTo NextRow
        End If
        
        ' For level 1, just store the row (manual value assumed to be already entered)
        If outlineLevel = 1 Then
            parentRows(1) = currentRow
        Else
            ' For levels > 1, we need parent row from level-1
            parentRow = parentRows(outlineLevel - 1)
            
            ' Check if parent row is valid
            If parentRow = 0 Then
                MsgBox "No parent found for row " & currentRow & " (level " & outlineLevel & "). Skipping.", vbExclamation
                GoTo NextRow
            End If
            
            ' Get weight from left cell
            weightValue = ws.Cells(currentRow, weightCol).Value
            
            ' Validate weight is numeric and between 0 and 1
            If Not IsNumeric(weightValue) Then
                MsgBox "Weight at row " & currentRow & " is not numeric. Skipping.", vbExclamation
                GoTo NextRow
            End If
            If weightValue < 0 Or weightValue > 1 Then
                MsgBox "Weight at row " & currentRow & " is out of range (0-1). Value: " & weightValue & ". Skipping.", vbExclamation
                GoTo NextRow
            End If
            
            ' Construct cell references for formula
            ' Parent cell: absolute row and absolute column (e.g., $C$5)
            parentAddress = ws.Cells(parentRow, breakdownCol).Address(True, True)
            ' Weight cell: relative row, absolute column? To keep weight column fixed but row relative, we use absolute column and relative row.
            ' But if we use Address(False, False) for weight, it will be like B6 (relative row and column). That's fine because column is fixed (B) and row will adjust if copied.
            ' However, we want the formula to always refer to the weight in the same row. Using relative row is okay because the formula is placed in that row.
            ' So we can use Address(False, False) which gives B6.
            weightAddress = ws.Cells(currentRow, weightCol).Address(False, False)
            
            ' Insert formula
            ws.Cells(currentRow, breakdownCol).Formula = "=" & parentAddress & "*" & weightAddress
            
            ' Apply formatting (optional)
            ws.Cells(currentRow, breakdownCol).NumberFormat = "0.00" ' Example format
        End If
        
        ' Update parent row for this level (for future children at deeper levels)
        If outlineLevel >= 1 And outlineLevel <= 20 Then
            parentRows(outlineLevel) = currentRow
        End If
        
NextRow:
        ' Allow Excel to breathe
        If currentRow Mod 100 = 0 Then DoEvents
    Next currentRow
    
    ' Auto-fit columns
    ws.Columns(breakdownCol).AutoFit
    ws.Columns(weightCol).AutoFit
    
    MsgBox "Breakdown formulas created successfully!" & vbCrLf & _
           "Processed rows: " & (lastRow - startCell.Row), vbInformation
End Sub

Function FindStopMarker(ws As Worksheet, col As Integer, startRow As Long, marker As String) As Long
    Dim searchRange As Range
    Dim foundCell As Range
    
    ' Search for the marker in the specified column
    Set searchRange = ws.Range(ws.Cells(startRow, col), ws.Cells(ws.Rows.Count, col))
    Set foundCell = searchRange.Find(What:=marker, LookIn:=xlValues, LookAt:=xlWhole)
    
    If Not foundCell Is Nothing Then
        FindStopMarker = foundCell.Row
    Else
        FindStopMarker = 0
    End If
End Function