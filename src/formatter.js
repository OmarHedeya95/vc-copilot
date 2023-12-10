function format_url_text(final_text, url) {
  final_text = `## ${url} Research\n` + final_text;
  final_text = final_text.replace(
    "Problem to be solved:",
    "#### Problem to be solved"
  );
  final_text = final_text.replace("Product:", "#### Product");
  final_text = final_text.replace("Features:", "#### Features");
  final_text = final_text.replace("Business Model:", "#### Business Model");
  final_text = final_text.replace("Competition:", "#### Competition");
  final_text = final_text.replace("Vision:", "#### Vision");
  final_text = final_text.replace("Extras:", "#### Extras");
  return final_text;
}

export { format_url_text };
