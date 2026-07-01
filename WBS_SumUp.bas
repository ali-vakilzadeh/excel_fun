'  WBS WEIGHTED PROGRESS SUM-UP
'  USAGE:
'    1- Completely create your WBS, use Excel Grouping (summary row above) to assign breakdown
'    2- you should have at least two adjacent columns
'	Left column (e.g. Column E) as WBS weights
'	Right column (e.g. Column F) as Progress sum-up
'    3- You must put your pointer at the first cell of the sum-up column (in our example: cell "F1")
'	the script scans the column to find the last row which should be marked like "EOWBS"
'	then uses the Excel grouping to create weighted sum-up formulas.
'

Sub CreateProgressRollupFormulas()
    Dim ws As Worksheet
    Dim startCell As Range
    Dim currentRow As Long
    Dim lastRow As Long
    Dim progressCol As Integer
    Dim weightCol As Integer
    Dim outlineLevel As Integer
    Dim childRows As Collection
    Dim childRow As Variant
    Dim numerator As String
    Dim denominator As String
    Dim formulaText As String
    Dim i As Long
    Dim j As Long
    Dim stopMarker As String
    Dim childCount As Integer
    Dim maxChildren As Integer
    Dim userResponse As VbMsgBoxResult
    Dim weightAddr As String
    Dim progressAddr As String
    
    ' Set maximum allowed children per parent
    maxChildren = 30
    
    ' Initialize
    Set ws = ActiveSheet
    Set startCell = ActiveCell
    progressCol = startCell.Column
    weightCol = progressCol - 1
    
    ' Validate weight column exists
    If weightCol < 1 Then
        MsgBox "There is no column to the left for weights. Please select a column that has a left neighbor.", vbExclamation
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
    
    ' Ask for stop marker
    stopMarker = InputBox("Enter the stop marker value (default is 'EOWBS'):", "Stop Marker", "EOWBS")
    If stopMarker = "" Then stopMarker = "EOWBS"
    
    ' Find stop marker in the progress column
    lastRow = FindStopMarker(ws, progressCol, startCell.Row, stopMarker)
    
    If lastRow = 0 Then
        ' Ask if user wants to continue without stop marker
        If MsgBox("Stop marker '" & stopMarker & "' not found. Do you want to process until the last row with data?", _
                  vbYesNo + vbQuestion, "Stop Marker Not Found") = vbNo Then
            Exit Sub
        Else
            lastRow = ws.Cells(ws.Rows.Count, progressCol).End(xlUp).Row
            If lastRow < startCell.Row Then
                lastRow = ws.UsedRange.Rows.Count + startCell.Row
            End If
        End If
    End If
    
    ' Confirm range
    If MsgBox("Processing range: Rows " & startCell.Row & " to " & (lastRow - 1) & vbCrLf & _
              "Progress column: " & Split(ws.Cells(1, progressCol).Address, "$")(1) & vbCrLf & _
              "Weight column: " & Split(ws.Cells(1, weightCol).Address, "$")(1) & vbCrLf & _
              "Maximum children per parent: " & maxChildren & vbCrLf & _
              "Total rows to process: " & (lastRow - startCell.Row) & vbCrLf & vbCrLf & _
              "Proceed?", vbYesNo + vbQuestion) = vbNo Then
        Exit Sub
    End If
    
    ' Loop through each row
    For currentRow = startCell.Row To lastRow - 1
        ' Get outline level
        outlineLevel = ws.Rows(currentRow).OutlineLevel
        
        ' Find all immediate children (level = outlineLevel + 1) that appear before next sibling/parent
        Set childRows = New Collection
        i = currentRow + 1
        Do While i < lastRow
            ' If we encounter a row with outline level <= current level, stop (next sibling or parent)
            If ws.Rows(i).OutlineLevel <= outlineLevel Then Exit Do
            
            ' If outline level equals current level + 1, it's an immediate child
            If ws.Rows(i).OutlineLevel = outlineLevel + 1 Then
                childRows.Add i
            End If
            i = i + 1
        Loop
        
        childCount = childRows.Count
        
        ' Check child count limit
        If childCount > maxChildren Then
            MsgBox "Parent at row " & currentRow & " has " & childCount & " children, which exceeds the maximum of " & maxChildren & "." & vbCrLf & _
                   "Please restructure your WBS or increase the limit in the script. Process will now exit.", vbCritical
            Exit Sub
        End If
        
        ' If there are children, create formula
        If childCount > 0 Then
            ' Build numerator and denominator strings
            numerator = "("
            denominator = "("
            
            For Each childRow In childRows
                ' Weight reference: absolute column and absolute row (e.g., $C$4)
                weightAddr = ws.Cells(childRow, weightCol).Address(True, True)
                ' Progress reference: absolute row, relative column (e.g., D$4) – allows horizontal copying
                progressAddr = ws.Cells(childRow, progressCol).Address(True, False)
                
                ' Add child part to numerator: $C$4 * D$4
                numerator = numerator & weightAddr & "*" & progressAddr & "+"
                ' Add child weight to denominator: $C$4 (sum of weights)
                denominator = denominator & weightAddr & "+"
            Next childRow
            
            ' Remove trailing "+" and add closing parenthesis
            numerator = Left(numerator, Len(numerator) - 1) & ")"
            denominator = Left(denominator, Len(denominator) - 1) & ")"
            
            ' Create full formula (optionally wrap in IFERROR to handle division by zero)
            formulaText = "=" & numerator & "/" & denominator
            
            ' Optional: wrap with IFERROR to show 0 if denominator is zero
            ' formulaText = "=IFERROR(" & numerator & "/" & denominator & ",0)"
            
            ' Insert formula into progress cell
            ws.Cells(currentRow, progressCol).Formula = formulaText
        End If
        
        ' Allow Excel to breathe
        If currentRow Mod 100 = 0 Then DoEvents
    Next currentRow
    
    ' Auto-fit columns
    ws.Columns(progressCol).AutoFit
    ws.Columns(weightCol).AutoFit
    
    MsgBox "Progress rollup formulas created successfully!" & vbCrLf & _
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