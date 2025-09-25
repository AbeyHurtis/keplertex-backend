aws dynamodb create-table \
  --table-name CompileStats \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=date,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=date,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
