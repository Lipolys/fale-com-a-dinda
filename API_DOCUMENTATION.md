# Documentação da API - Fale com a Dinda

Esta documentação descreve os endpoints disponíveis na API do projeto Fale com a Dinda.

## Visão Geral

*   **Base URL**: `http://localhost:3000` (ou a porta configurada em `.env`)
*   **Formato de Resposta**: JSON
*   **Autenticação**: Bearer Token (JWT)

## Autenticação

A maioria das rotas requer autenticação. O token JWT deve ser enviado no header `Authorization`.

**Header:**
`Authorization: Bearer <seu_access_token>`

---

## Endpoints

### 1. Usuários (`/usuario`)

Gerenciamento de contas de usuários (Clientes e Farmacêuticos).

#### Cadastrar Usuário
*   **Método**: `POST`
*   **URL**: `/usuario/cadastrar`
*   **Acesso**: Público
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "nome": "João Silva",
      "email": "joao@email.com",
      "senha": "senha123",
      "telefone": "11999999999",
      "nascimento": "1990-01-01",
      "tipo": "CLIENTE", // ou "FARMACEUTICO"
      "crf": "12345" // Obrigatório apenas se tipo for "FARMACEUTICO"
    }
    ```
*   **Respostas**:
    *   `201 Created`: Usuário cadastrado com sucesso.
    *   `400 Bad Request`: Campos obrigatórios faltando ou dados inválidos.
    *   `409 Conflict`: Email já cadastrado.

#### Login
*   **Método**: `POST`
*   **URL**: `/usuario/login`
*   **Acesso**: Público
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "email": "joao@email.com",
      "senha": "senha123"
    }
    ```
*   **Respostas**:
    *   `200 OK`: Retorna `accessToken`, `refreshToken` e dados do usuário.
    *   `401 Unauthorized`: Credenciais inválidas.

#### Refresh Token
*   **Método**: `POST`
*   **URL**: `/usuario/refresh-token`
*   **Acesso**: Público (Requer Refresh Token válido)
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "refreshToken": "seu_refresh_token_aqui"
    }
    ```
*   **Respostas**:
    *   `200 OK`: Retorna novos `accessToken` e `refreshToken`.
    *   `401 Unauthorized`: Token inválido ou expirado.

#### Logout
*   **Método**: `POST`
*   **URL**: `/usuario/logout`
*   **Acesso**: Público (Requer Refresh Token para revogação)
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "refreshToken": "seu_refresh_token_aqui"
    }
    ```
*   **Respostas**:
    *   `200 OK`: Logout realizado com sucesso.

---

### 2. Dicas de Saúde (`/dica`)

Dicas cadastradas por farmacêuticos.

#### Listar Dicas
*   **Método**: `GET`
*   **URL**: `/dica`
*   **Acesso**: Autenticado (Qualquer usuário logado)
*   **Respostas**:
    *   `200 OK`: Lista de dicas com dados do farmacêutico autor.

#### Criar Dica
*   **Método**: `POST`
*   **URL**: `/dica`
*   **Acesso**: Farmacêutico
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "texto": "Beba 2 litros de água por dia."
    }
    ```
*   **Respostas**:
    *   `201 Created`: Dica criada.
    *   `403 Forbidden`: Apenas farmacêuticos podem criar.

#### Editar Dica
*   **Método**: `PUT`
*   **URL**: `/dica/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "texto": "Texto atualizado da dica."
    }
    ```

#### Deletar Dica
*   **Método**: `DELETE`
*   **URL**: `/dica/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)

---

### 3. FAQs (`/faq`)

Perguntas frequentes.

#### Listar FAQs
*   **Método**: `GET`
*   **URL**: `/faq`
*   **Acesso**: Autenticado
*   **Respostas**:
    *   `200 OK`: Lista de perguntas e respostas.

#### Criar FAQ
*   **Método**: `POST`
*   **URL**: `/faq`
*   **Acesso**: Farmacêutico
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "pergunta": "Como tomar antibiótico?",
      "resposta": "Sempre no horário correto e até o fim do tratamento."
    }
    ```

#### Editar FAQ
*   **Método**: `PUT`
*   **URL**: `/faq/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)

#### Deletar FAQ
*   **Método**: `DELETE`
*   **URL**: `/faq/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)

---

### 4. Medicamentos (`/medicamento`)

Catálogo de medicamentos cadastrados no sistema.

#### Listar Medicamentos
*   **Método**: `GET`
*   **URL**: `/medicamento`
*   **Acesso**: Autenticado
*   **Respostas**:
    *   `200 OK`: Lista de medicamentos cadastrados.

#### Criar Medicamento
*   **Método**: `POST`
*   **URL**: `/medicamento`
*   **Acesso**: Farmacêutico
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "nome": "Dipirona",
      "descricao": "Analgésico e antitérmico.",
      "classe": "Analgésico"
    }
    ```

#### Editar Medicamento
*   **Método**: `PUT`
*   **URL**: `/medicamento/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)

#### Deletar Medicamento
*   **Método**: `DELETE`
*   **URL**: `/medicamento/:id`
*   **Acesso**: Farmacêutico (Apenas o autor)

---

### 5. Meus Medicamentos (`/ministra`)

Controle de uso de medicamentos pelo cliente.

#### Adicionar Medicamento à Minha Lista
*   **Método**: `POST`
*   **URL**: `/ministra`
*   **Acesso**: Cliente
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "medicamento_idmedicamento": 1,
      "horario": "08:00",
      "dosagem": "500mg",
      "frequencia": "8 em 8 horas",
      "status": 1
    }
    ```
*   **Respostas**:
    *   `201 Created`: Medicamento adicionado à lista do cliente.
    *   `409 Conflict`: Cliente já possui este medicamento na lista.

#### Listar Meus Medicamentos
*   **Método**: `GET`
*   **URL**: `/ministra`
*   **Acesso**: Cliente
*   **Respostas**:
    *   `200 OK`: Lista de medicamentos que o cliente está tomando.

#### Detalhes de um Medicamento em Uso
*   **Método**: `GET`
*   **URL**: `/ministra/:id`
*   **Acesso**: Cliente (Apenas dono do registro)

#### Editar Uso de Medicamento
*   **Método**: `PUT`
*   **URL**: `/ministra/:id`
*   **Acesso**: Cliente
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "horario": "09:00",
      "dosagem": "1g"
    }
    ```

#### Remover Medicamento da Lista
*   **Método**: `DELETE`
*   **URL**: `/ministra/:id`
*   **Acesso**: Cliente

---

### 6. Interações Medicamentosas (`/interacao`)

Gerenciamento e verificação de interações entre medicamentos.

#### Verificar Minhas Interações
*   **Método**: `GET`
*   **URL**: `/interacao/verificar`
*   **Acesso**: Cliente
*   **Descrição**: Verifica automaticamente se há interações perigosas entre os medicamentos que o cliente cadastrou em sua lista (`/ministra`).
*   **Respostas**:
    *   `200 OK`: Lista de interações encontradas ou array vazio se nenhuma for detectada.

#### Listar Todas Interações
*   **Método**: `GET`
*   **URL**: `/interacao`
*   **Acesso**: Autenticado
*   **Respostas**:
    *   `200 OK`: Lista de todas as interações cadastradas no banco.

#### Criar Interação
*   **Método**: `POST`
*   **URL**: `/interacao`
*   **Acesso**: Farmacêutico
*   **Corpo da Requisição (JSON)**:
    ```json
    {
      "idmedicamento1": 1,
      "idmedicamento2": 2,
      "descricao": "Risco de hemorragia.",
      "gravidade": "ALTA", // "BAIXA", "MEDIA", "ALTA"
      "fonte": "Bula do remédio X"
    }
    ```

#### Editar Interação
*   **Método**: `PUT`
*   **URL**: `/interacao/:medId1/:medId2`
*   **Acesso**: Farmacêutico
*   **Nota**: Os IDs na URL são os IDs dos medicamentos envolvidos.

#### Deletar Interação
*   **Método**: `DELETE`
*   **URL**: `/interacao/:medId1/:medId2`
*   **Acesso**: Farmacêutico
