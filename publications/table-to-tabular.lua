-- Force natural (content-based) column widths instead of pandoc's
-- fixed-fraction estimate, which measures raw source markup length
-- (counting $, \sqrt{}, etc.) rather than rendered width and badly
-- miscalculates for tables mixing plain text with math.
function Table(tbl)
  local colspecs = tbl.colspecs
  for i, spec in ipairs(colspecs) do
    colspecs[i] = { spec[1], pandoc.ColWidthDefault }
  end
  tbl.colspecs = colspecs
  return tbl
end
