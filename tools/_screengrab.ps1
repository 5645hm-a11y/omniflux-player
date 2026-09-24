# צילום המסך כולו, ולא רק חלון הממשק.
#
# ‏Playwright מצלם את מה ש-Chromium צייר, וחלון המנוע אינו שם: הוא
# חלון נפרד שיושב מתחת. כדי לראות אם הווידאו באמת מופיע במרובע
# שבסרגל הנגן צריך צילום ברמת מערכת ההפעלה.
param([Parameter(Mandatory = $true)][string]$Out)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$gfx.Dispose()
$bmp.Dispose()
Write-Output "$($bounds.Width)x$($bounds.Height)"
