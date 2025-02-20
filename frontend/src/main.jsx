import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import { from } from '@apollo/client'
import './App.css' // Importera CSS

// Skapa error handling link
const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors)
    graphQLErrors.forEach(({ message, locations, path }) =>
      console.error(
        `[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`,
      ),
    )
  if (networkError) console.error(`[Network error]: ${networkError}`)
})

// Skapa HTTP-länk
const httpLink = createHttpLink({
  uri: '/api/graphql',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  }
})

// Kombinera länkar
const link = from([errorLink, httpLink])

// Skapa Apollo Client
const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'no-cache',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'no-cache',
      errorPolicy: 'all',
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApolloProvider client={client}>
      <App />
    </ApolloProvider>
  </React.StrictMode>
)
